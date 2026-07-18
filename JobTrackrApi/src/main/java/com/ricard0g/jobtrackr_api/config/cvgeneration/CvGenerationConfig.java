package com.ricard0g.jobtrackr_api.config.cvgeneration;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@EnableConfigurationProperties(CvGenerationProperties.class)
public class CvGenerationConfig {

    @Bean
    public HttpClient cvGenerationHttpClient(final CvGenerationProperties properties) {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }
}
