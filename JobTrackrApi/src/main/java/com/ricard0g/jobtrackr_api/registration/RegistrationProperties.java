package com.ricard0g.jobtrackr_api.registration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jobtrackr.registration")
public record RegistrationProperties(String resendApiKey, String fromEmail, String publicOrigin) { }
