package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.service.CompanyService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/companies")
@RequiredArgsConstructor
@Validated
public class CompanyController {

    private final CompanyService companyService;

    @GetMapping
    public ResponseEntity<List<CompanyResponseDto>> getAllCompanies(
            final Principal principal) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(companyService.getAllCompanies(userId));
    }

    @GetMapping("/{companyId}")
    public ResponseEntity<CompanyResponseDto> getCompanyById(
            final Principal principal, @PathVariable @Positive final Long companyId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(companyService.getCompanyById(userId, companyId));
    }

    @PostMapping
    public ResponseEntity<CompanyResponseDto> createCompany(
            final Principal principal,
            @Valid @RequestBody final CompanyCreateRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(companyService.createCompany(userId, request));
    }

    @PutMapping("/{companyId}")
    public ResponseEntity<CompanyResponseDto> replaceCompany(
            final Principal principal,
            @PathVariable @Positive final Long companyId,
            @Valid @RequestBody final CompanyPutRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(companyService.replaceCompany(userId, companyId, request));
    }

    @DeleteMapping("/{companyId}")
    public ResponseEntity<Void> deleteCompany(
            final Principal principal, @PathVariable @Positive final Long companyId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        companyService.deleteCompany(userId, companyId);
        return ResponseEntity.noContent().build();
    }
}
