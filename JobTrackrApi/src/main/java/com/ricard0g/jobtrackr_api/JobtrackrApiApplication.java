package com.ricard0g.jobtrackr_api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class JobtrackrApiApplication {

	private static final Logger log = LoggerFactory.getLogger(JobtrackrApiApplication.class);

	public static void main(String[] args) {
		SpringApplication.run(JobtrackrApiApplication.class, args);

		log.info("SERVER RUNNING ON PORT {}", System.getenv("HOST_PORT"));
	}

}
