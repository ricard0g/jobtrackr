package com.ricard0g.jobtrackr_api.billing;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(StripeProperties.class)
public class BillingConfig {
    public BillingConfig(final StripeProperties properties) {
        properties.validate();
    }
}
