package com.ricard0g.jobtrackr_api.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UserAuthVersionService {

    private final UserRepository userRepository;

    @Transactional
    public int advance(final UUID userId) {
        final User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));
        user.advanceAuthenticationVersion();
        userRepository.save(user);
        return user.getUserAuthVersion();
    }
}
