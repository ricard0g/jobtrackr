package com.ricard0g.jobtrackr_api.security;

import org.aopalliance.intercept.MethodInvocation;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationTrustResolver;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.authorization.method.MethodAuthorizationDeniedHandler;
import org.springframework.stereotype.Component;

import com.ricard0g.jobtrackr_api.billing.BillingException;

@Component
public class PaidAccessDeniedHandler implements MethodAuthorizationDeniedHandler {
    private static final AuthenticationTrustResolver TRUST_RESOLVER = new AuthenticationTrustResolverImpl();

    @Override
    public Object handleDeniedInvocation(final MethodInvocation methodInvocation,
                                         final AuthorizationResult authorizationResult) {
        if (!TRUST_RESOLVER.isAuthenticated(SecurityContextHolder.getContext().getAuthentication())) {
            throw new AuthorizationDeniedException("Access denied", authorizationResult);
        }
        throw new BillingException(HttpStatus.FORBIDDEN, "PAID_ACCESS_REQUIRED",
                "Creating a new Application requires current paid access. Your existing work remains available.");
    }
}
