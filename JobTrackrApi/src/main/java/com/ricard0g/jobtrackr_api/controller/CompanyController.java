package com.ricard0g.jobtrackr_api.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.CompanyCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.service.CompanyService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/users/{userId}/companies")
@RequiredArgsConstructor
@Validated
public class CompanyController {

    private final CompanyService companyService;

    @GetMapping
    public ResponseEntity<List<CompanyResponseDto>> getAllCompanies(
            @PathVariable @Positive final Long userId) {
        return ResponseEntity.ok(companyService.getAllCompanies(userId));
    }

    @GetMapping("/{companyId}")
    public ResponseEntity<CompanyResponseDto> getCompanyById(
            @PathVariable @Positive final Long userId, @PathVariable @Positive final Long companyId) {
        return ResponseEntity.ok(companyService.getCompanyById(userId, companyId));
    }

    @PostMapping
    public ResponseEntity<CompanyResponseDto> createCompany(
            @PathVariable @Positive final Long userId,
            @Valid @RequestBody final CompanyCreateRequestDto request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(companyService.createCompany(userId, request));
    }

    @DeleteMapping("/{companyId}")
    public ResponseEntity<Void> deleteCompany(
            @PathVariable @Positive final Long userId, @PathVariable @Positive final Long companyId) {
        companyService.deleteCompany(userId, companyId);
        return ResponseEntity.noContent().build();
    }
}
