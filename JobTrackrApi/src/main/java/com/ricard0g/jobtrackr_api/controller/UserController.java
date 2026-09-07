package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.UserDto.GoogleLinkIntentRequestDto;
import com.ricard0g.jobtrackr_api.dto.UserDto.SignInMethodsResponseDto;
import com.ricard0g.jobtrackr_api.dto.UserDto.UserPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.UserDto.UserResponseDto;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationAction;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimitKey;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;
import com.ricard0g.jobtrackr_api.service.GoogleLinkIntentService;
import com.ricard0g.jobtrackr_api.service.UserService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/user")
@RequiredArgsConstructor
@Validated
public class UserController {

    private static final String UNKNOWN_CLIENT_IP = "unknown";

    private final UserService userService;
    private final GoogleLinkIntentService googleLinkIntentService;
    private final AuthenticationRateLimiter authenticationRateLimiter;

    @GetMapping
    public ResponseEntity<UserResponseDto> getAuthenticatedUser(final Principal principal) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(userService.getUserById(userId));
    }

    @GetMapping("/sign-in-methods")
    public ResponseEntity<SignInMethodsResponseDto> getSignInMethods(final Principal principal) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(userService.getSignInMethods(userId));
    }

    @PatchMapping
    public ResponseEntity<UserResponseDto> patchAuthenticatedUser(
            final Principal principal,
            @Valid @RequestBody final UserPatchRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(userService.updateProfile(userId, request));
    }

    @PostMapping("/sign-in-identities/google/link-intent")
    public ResponseEntity<Void> createGoogleLinkIntent(
            final Principal principal,
            @Valid @RequestBody final GoogleLinkIntentRequestDto request,
            final HttpServletRequest httpRequest,
            final HttpServletResponse httpResponse) {
        final UUID userId = AuthenticatedUserId.from(principal);
        authenticationRateLimiter.consume(
                AuthenticationAction.PROTECTED_SECURITY,
                AuthenticationRateLimitKey.userAndClientIp(userId, clientIp(httpRequest)));
        googleLinkIntentService.beginLink(userId, request.currentPassword(), httpRequest, httpResponse);
        return ResponseEntity.noContent().build();
    }

    private static String clientIp(final HttpServletRequest request) {
        final String remoteAddr = request.getRemoteAddr();
        final boolean missingRemoteAddr = remoteAddr == null || remoteAddr.isBlank();
        if (missingRemoteAddr) {
            return UNKNOWN_CLIENT_IP;
        }
        return remoteAddr;
    }
}
