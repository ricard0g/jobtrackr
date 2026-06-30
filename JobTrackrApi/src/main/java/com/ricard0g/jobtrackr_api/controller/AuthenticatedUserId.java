package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.UUID;

final class AuthenticatedUserId {

    private AuthenticatedUserId() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }

    static UUID from(final Principal principal) {
        return UUID.fromString(principal.getName());
    }
}
