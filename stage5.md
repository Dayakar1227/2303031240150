# Stage 5

# Reliable Bulk Notification Dispatch ("Notify All")

## 1. The Pseudocode in Question

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # real-time mechanism from Stage 1
```

## 2. Shortcomings of This Implementation

- **Synchronous, in-process loop over 50,000 students.** This runs inside a single request/process, blocking on a network call (`send_email`) for every student, one at a time. At even 200ms per email API call, that's roughly 2.8 hours sequentially — far too slow, and it will likely hit an HTTP request timeout, a function/worker timeout (if running in something like a serverless function), or tie up a web server thread for an unacceptable duration.
- **No error handling at all.** If `send_email` throws or the Email API returns an error for one student, there's nothing here to catch it, log it, retry it, or continue past it — depending on the language, the entire loop could halt partway through, leaving an unknown subset of the 50,000 students processed and the rest never attempted.
- **No retry mechanism.** Transient failures (network blip, Email API rate limit, momentary DB connection issue) have no way to recover; a failed call is just lost.
- **No idempotency / duplicate-send protection.** If the process crashes partway and is re-run from the start, students already notified would get a duplicate email and a duplicate DB row/push, since there's no tracking of "who has already been processed."
- **Three different failure domains coupled together per student, with no isolation.** `send_email`, `save_to_db`, and `push_to_app` each have independent failure modes (Email API down, DB connection pool exhausted, WebSocket gateway unreachable), but the pseudocode treats them as one atomic unit with no per-step error handling — one failing doesn't tell you anything about whether the others succeeded for that student.
- **`save_to_db` called once per student in a loop = 50,000 individual `INSERT` statements**, each presumably its own round trip/transaction, instead of a single batched/bulk insert — needlessly slow and puts unnecessary load on the DB (directly related to the Stage 4 problem of DB overload).
- **No rate limiting against the Email API.** Most email providers (SendGrid, SES, etc.) enforce a requests-per-second cap; firing 50,000 calls as fast as the loop can go will likely trigger `429` rate-limit errors rather than respecting provider limits.
- **No observability.** There's no per-student status tracking, no way to answer "did student 1042 get notified?" after the fact, and no aggregate success/failure count for HR to see "49,800 succeeded, 200 failed."

## 3. The 200 Failed `send_email` Calls — What Now?

Given the original pseudocode, midway failures are effectively unrecoverable: there's no record of *which* 200 students failed (the loop just stops or silently logs an exception per the prompt's "logs indicate" framing), no automatic retry, and no way to safely re-run the whole job without risking duplicate emails to the 49,800 who already succeeded.

The fix is **not** "go re-run the script" — it's to redesign the process so each student's notification has tracked, queryable state, so failures are: (a) visible per-student, (b) retryable without re-processing successes, and (c) bounded (don't retry forever on a permanently bad email address).

## 4. Should Saving to DB and Sending the Email Happen Together?

**No — they should not be coupled into one synchronous step.** They should be decoupled via a queue, and here's why:

- **Different reliability/performance characteristics.** `save_to_db` is a fast, local, reliable operation (especially as a batch insert). `send_email` is a slow, external, less reliable network call to a third-party API. Chaining a fast/reliable operation to a slow/unreliable one means the fast operation's overall latency and reliability degrade to match the slow one.
- **The DB write is what makes the notification "exist" in the system** (it's what `GET /api/v1/notifications` reads from, per the Stage 1/2 contract) — that should happen first and fast, independent of whether the email succeeds yet. A student should see the in-app notification even if their email send is still retrying or has failed.
- **Decoupling allows independent retry policies.** Email sends need retries with backoff and eventual dead-lettering (an email API can be flaky); the DB insert and in-app push don't need that same retry shape. Coupling them forces both to share the same retry behavior, which doesn't fit either one well.
- **The right pattern: write to DB first (source of truth + in-app visibility), then enqueue the email as an asynchronous job.** This way, "save to DB" and "push to app" (both fast, both internal) happen immediately and reliably as a batch, while "send email" happens out-of-band through a queue with its own retry/backoff/dead-letter handling, decoupled from the critical path.

## 5. Redesign: Reliable and Fast

**Architecture:**

1. **Batch-insert** all 50,000 notification rows into PostgreSQL in one (or a few chunked) bulk `INSERT` statements, each row starting in a `pending` email-delivery state. This is the fast, synchronous part of the request — it makes notifications immediately visible in-app and via the real-time channel.
2. **Push to app immediately**, via the existing real-time fan-out (Stage 1, Redis pub/sub → WebSocket/SSE), for all currently-connected students — this is cheap and can happen right after the batch insert, in bulk.
3. **Enqueue an email job per student** (or per batch) onto a message queue (e.g. SQS, RabbitMQ, Kafka) rather than calling the Email API inline. The HTTP request that HR triggered ("Notify All") returns quickly once the DB write and enqueue are done — it does not wait for 50,000 emails to send.
4. **A pool of background workers consumes the queue**, calling the Email API with controlled concurrency (respecting the provider's rate limit), and updates each notification row's `email_status` (`sent` / `failed` / `retrying`) as it processes.
5. **Per-job retry with exponential backoff** for transient failures (e.g. 3 attempts with backoff), and a **dead-letter queue** for jobs that exhaust retries (e.g. permanently invalid email address) — these land in a queryable "failed" bucket rather than disappearing.
6. **Idempotency key per student per notification batch** (e.g. `notificationId + studentId`) so that if a worker retries or a job is redelivered (common in at-least-once queue semantics), it can check "has this email already been sent?" before sending again — preventing duplicate emails.

### Revised Pseudocode

```
function notify_all(student_ids: array, message: string):
    notification_batch_id = generate_id()

    # Step 1: Fast, reliable, batched write — the source of truth
    rows = [
        {
            studentId: id,
            notificationId: generate_notification_id(),
            batchId: notification_batch_id,
            message: message,
            emailStatus: "pending",
            createdAt: now()
        }
        for id in student_ids
    ]
    batch_insert_notifications(rows)   # one bulk INSERT, not 50,000 individual ones

    # Step 2: Immediate in-app push (cheap, internal, no external dependency)
    for chunk in chunk(rows, 500):
        push_to_app_bulk(chunk)        # fan out via Redis pub/sub -> WebSocket/SSE

    # Step 3: Enqueue email jobs — do NOT call the Email API inline
    for row in rows:
        enqueue_email_job(
            idempotencyKey = f"{row.notificationId}:{row.studentId}",
            studentId = row.studentId,
            message = message
        )

    return {
        batchId: notification_batch_id,
        studentsQueued: len(student_ids)
    }   # returns immediately; HR doesn't wait for emails to send


# Runs separately, as a pool of background workers consuming the email queue
function email_worker(job):
    if already_sent(job.idempotencyKey):
        ack(job)        # already processed, avoid duplicate send
        return

    try:
        rate_limited_send_email(job.studentId, job.message)   # respects provider rate limit
        update_email_status(job.idempotencyKey, "sent")
        ack(job)
    except TransientError:
        nack_with_backoff(job)     # requeue with exponential backoff, up to max attempts
    except PermanentError:         # e.g. invalid address, hard bounce
        update_email_status(job.idempotencyKey, "failed_permanent")
        send_to_dead_letter_queue(job)
        ack(job)


# Visibility for HR / support: query status across the batch at any time
function get_batch_status(notification_batch_id):
    return query(
        "SELECT email_status, COUNT(*) FROM notifications WHERE batch_id = $1 GROUP BY email_status",
        notification_batch_id
    )
```

### How This Addresses the 200 Failures

With this design, the 200 failed `send_email` calls are no longer a mystery: each failed job either lands back in the queue for automatic retry (transient errors, e.g. a momentary Email API outage) or lands in the dead-letter queue with a `failed_permanent` status against a specific `studentId` (e.g. a bounced/invalid address). Support can then run `get_batch_status` to see exactly which 200 students are in a failed state, inspect the dead-letter queue for the reason, fix the underlying issue (e.g. correct an email address), and safely re-enqueue just those 200 jobs — without resending to the 49,800 who already succeeded, thanks to the idempotency key.

### Tradeoffs of This Redesign

- *Pro*: HR's "Notify All" action returns in roughly the time it takes to do one bulk insert, not 2+ hours — in-app notifications and the DB record appear immediately for all 50,000 students.
- *Pro*: Email sending failures are isolated, visible, retryable, and bounded — no more silent loss of state.
- *Pro*: Respects the Email API's rate limits via controlled worker concurrency, instead of hammering it with 50,000 near-simultaneous calls.
- *Con*: More moving parts — a message queue and a worker pool are new infrastructure to operate and monitor, compared to the original simple loop.
- *Con*: Eventual consistency on the email side — a student's "email sent" status may lag behind their in-app notification by seconds to minutes, depending on queue depth and worker throughput. This is an acceptable tradeoff, since the in-app notification (the more time-sensitive channel) is unaffected and appears immediately.

