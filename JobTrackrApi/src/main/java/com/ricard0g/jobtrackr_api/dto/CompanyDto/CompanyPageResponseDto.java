package com.ricard0g.jobtrackr_api.dto.CompanyDto;

import java.util.List;

import org.springframework.data.domain.Page;

public record CompanyPageResponseDto(
        List<CompanyResponseDto> items,
        long total,
        int page,
        int size) {

    public static CompanyPageResponseDto from(final Page<CompanyResponseDto> page) {
        return new CompanyPageResponseDto(
                page.getContent(),
                page.getTotalElements(),
                page.getNumber(),
                page.getSize());
    }
}
