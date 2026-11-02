-- Applications where Submit was pressed without a thank-you, recorded as "held" before the Submit lock existed:
-- mark them unsure so they are never approved and sent a second time.
UPDATE `apply_tasks`
SET `status` = 'unsure',
    `submit_pressed_at` = coalesce(`submit_pressed_at`, `started_at`, `updated_at`),
    `summary` = 'Submit was pressed but no thank-you page showed. Check your email (and the open tab); then press “I submitted it” or “It didn''t go through”.'
WHERE `status` = 'held' AND `summary` LIKE 'Pressed Submit%';
