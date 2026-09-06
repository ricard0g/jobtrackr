package com.ricard0g.jobtrackr_api.exception;

import com.ricard0g.jobtrackr_api.security.oauth.OAuthResultCode;

public class GoogleSignInRejectedException extends RuntimeException {

    private final OAuthResultCode resultCode;

    public GoogleSignInRejectedException(final OAuthResultCode resultCode) {
        super("Google sign-in was rejected");
        this.resultCode = resultCode;
    }

    public OAuthResultCode resultCode() {
        return resultCode;
    }
}
