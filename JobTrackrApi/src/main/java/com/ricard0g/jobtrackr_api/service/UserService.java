package com.ricard0g.jobtrackr_api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.UserDto.UserResponseDto;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<UserResponseDto> getAllUsers() {
        final List<UserResponseDto> users =
                userRepository.findAll().stream().map(UserResponseDto::from).toList();
        log.info("[UserService] - GET_ALL_USERS: responseCount: {}", users.size());
        return users;
    }
}
