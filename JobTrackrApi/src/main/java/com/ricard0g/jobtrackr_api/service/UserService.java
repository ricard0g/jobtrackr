package com.ricard0g.jobtrackr_api.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.UserDto.SignInMethodsResponseDto;
import com.ricard0g.jobtrackr_api.dto.UserDto.UserPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.UserDto.UserResponseDto;
import com.ricard0g.jobtrackr_api.exception.EmailNotMutableException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;
    private final UserIdentityRepository userIdentityRepository;

    @Transactional(readOnly = true)
    public UserResponseDto getUserById(final UUID userId) {
        final UserResponseDto user = userRepository.findById(userId)
                .map(UserResponseDto::from)
                .orElseThrow(() -> new UserNotFoundException(userId));
        log.info("[UserService] - GET_USER_BY_ID: userId: {}", userId);
        return user;
    }

    @Transactional(readOnly = true)
    public SignInMethodsResponseDto getSignInMethods(final UUID userId) {
        final User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));
        log.info("[UserService] - GET_SIGN_IN_METHODS: userId: {}", userId);
        return SignInMethodsResponseDto.from(
                user,
                userIdentityRepository.findByUser_UserIdAndProvider(userId, IdentityProvider.GOOGLE));
    }

    @Transactional
    public UserResponseDto updateProfile(final UUID userId, final UserPatchRequestDto request) {
        if (request.attemptsEmailMutation()) {
            throw new EmailNotMutableException();
        }

        final User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));
        user.setUserDisplayName(normalizeOptional(request.displayName()));
        log.info("[UserService] - UPDATE_PROFILE: userId: {}", userId);
        return UserResponseDto.from(user);
    }

    private String normalizeOptional(final String value) {
        if (value == null) {
            return null;
        }

        final String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
