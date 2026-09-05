package com.ricard0g.jobtrackr_api.security.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

public final class MutableClock extends Clock {

    private final ZoneId zone;
    private volatile Instant instant;

    public MutableClock(final Instant instant) {
        this(instant, ZoneOffset.UTC);
    }

    private MutableClock(final Instant instant, final ZoneId zone) {
        this.instant = instant;
        this.zone = zone;
    }

    public void advance(final Duration duration) {
        instant = instant.plus(duration);
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(final ZoneId zone) {
        return new MutableClock(instant, zone);
    }

    @Override
    public Instant instant() {
        return instant;
    }
}
