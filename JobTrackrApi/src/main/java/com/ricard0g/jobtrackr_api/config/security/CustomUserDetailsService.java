package com.ricard0g.jobtrackr_api.config.security;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(final String username) throws UsernameNotFoundException {
        final User user = findUser(username);
        return new org.springframework.security.core.userdetails.User(
                user.getUserId().toString(),
                user.getUserPasswordHash() != null ? user.getUserPasswordHash() : "",
                user.isUserEnabled(),
                true,
                true,
                !user.isUserLocked(),
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    private User findUser(final String username) {
        try {
            final UUID userId = UUID.fromString(username);
            return userRepository.findById(userId)
                    .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
        } catch (IllegalArgumentException exception) {
            return userRepository.findByUserEmail(username)
                    .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
        }
    }
}
