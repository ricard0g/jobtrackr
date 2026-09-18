package com.ricard0g.jobtrackr_api.config.security;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;

public class JobTrackrUserDetails extends User {

    private final int authenticationVersion;

    public JobTrackrUserDetails(
            final UUID userId,
            final String passwordHash,
            final boolean enabled,
            final boolean locked,
            final int authenticationVersion) {
        super(
                userId.toString(),
                passwordHash != null ? passwordHash : "",
                enabled,
                true,
                true,
                !locked,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        this.authenticationVersion = authenticationVersion;
    }

    public int getAuthenticationVersion() {
        return authenticationVersion;
    }
}
