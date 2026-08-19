package com.ricard0g.jobtrackr_api.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.config.security.JwtProperties;
import com.ricard0g.jobtrackr_api.config.storage.R2Properties;

@Configuration
@Profile("production")
public class ProductionEnvironmentConfig {

    public ProductionEnvironmentConfig(
            @Value("${spring.datasource.password:}") final String postgresPassword,
            final JwtProperties jwtProperties,
            final CvGenerationProperties cvGenerationProperties,
            final R2Properties r2Properties) {
        ProductionCredentials.validate(
                postgresPassword,
                jwtProperties.getSigningKey(),
                cvGenerationProperties.serviceToken(),
                r2Properties);
    }
}
