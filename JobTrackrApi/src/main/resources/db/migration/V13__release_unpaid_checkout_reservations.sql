UPDATE billing_checkouts c
SET state = 'OPEN'
FROM billing_subscriptions s
WHERE s.checkout_id = c.id
    AND c.state = 'PAID'
    AND s.status = 'incomplete'
    AND NOT EXISTS (
        SELECT 1 FROM billing_payments p
        WHERE p.checkout_id = c.id AND p.outcome = 'paid'
    );
