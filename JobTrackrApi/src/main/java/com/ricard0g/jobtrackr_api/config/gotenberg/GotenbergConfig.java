package com.ricard0g.jobtrackr_api.config.gotenberg;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(GotenbergProperties.class)
public class GotenbergConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    public GotenbergConfig(final GotenbergProperties properties) {
        properties.validate();
    }

    @Bean
    public HttpClient gotenbergJdkHttpClient() {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
    }
}
