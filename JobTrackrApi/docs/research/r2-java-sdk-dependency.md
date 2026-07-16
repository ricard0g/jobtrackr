# Cloudflare R2 Java Dependency Decision

Research date: 2026-07-15

## Recommendation

Use the AWS SDK for Java v2 directly, with its BOM and the `software.amazon.awssdk:s3` module. Do not add
`io.awspring.cloud:spring-cloud-aws-starter-s3` for this increment.

JobTrackr needs only `PutObject`, `DeleteObject`, and presigned `GetObject` operations, all hidden behind its own
storage interface. The direct SDK gives that adapter `S3Client` and `S3Presigner` without adding a second storage
abstraction or broader Spring Cloud dependency-management surface. It is also the library and configuration model
used by Cloudflare's official Java R2 example.

```xml
<properties>
    <aws-sdk.version><!-- pin the selected, tested AWS SDK v2 release --></aws-sdk.version>
</properties>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>software.amazon.awssdk</groupId>
            <artifactId>bom</artifactId>
            <version>${aws-sdk.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <dependency>
        <groupId>software.amazon.awssdk</groupId>
        <artifactId>s3</artifactId>
    </dependency>
</dependencies>
```

The `s3` module contains both `S3Client` and `S3Presigner`. It also brings the default Apache synchronous HTTP
client at runtime, so no second dependency is required unless JobTrackr needs to configure that HTTP client
explicitly. AWS recommends importing the SDK BOM and selecting only the required service modules rather than the
whole SDK. Sources: [AWS Maven setup](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/setup-project-maven.html),
[AWS Apache HTTP client configuration](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/http-configuration-apache.html),
and [AWS presigning guide](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/examples-s3-presign.html).

## Compatibility

The repository currently uses Spring Boot 4.0.6 and Java 25. Direct AWS SDK v2 is independent of Spring Boot and
requires Java 8 or later, so Java 25 is within its runtime baseline. Spring Boot 4 requires Java 17 or later.
Sources: [AWS SDK setup requirements](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/setup.html)
and [Spring Boot 4 migration requirements](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide#review-system-requirements).

The proposed AWSpring starter is also technically compatible, but only its 4.x line should be considered:

- Spring Cloud AWS 4.x targets Spring Boot 4.0.x and Spring Framework 7.x.
- The current stable AWSpring release is 4.0.2.
- Its 4.0.2 BOM manages AWS SDK v2.42.36.
- Therefore, the unversioned starter snippet in isolation is incomplete; it requires importing
  `io.awspring.cloud:spring-cloud-aws-dependencies:4.0.2`, or explicitly specifying the starter version.

Sources: [AWSpring compatibility table](https://github.com/awspring/spring-cloud-aws#compatibility-with-spring-project-versions),
[AWSpring 4.0.2 release](https://github.com/awspring/spring-cloud-aws/releases/tag/v4.0.2),
[AWSpring 4.0.2 BOM source](https://github.com/awspring/spring-cloud-aws/blob/v4.0.2/spring-cloud-aws-dependencies/pom.xml),
and [starter artifact metadata](https://central.sonatype.com/artifact/io.awspring.cloud/spring-cloud-aws-starter-s3/4.0.2).

## R2-specific client configuration

Both `S3Client` and `S3Presigner` must be singleton beans built from the same validated R2 configuration:

```text
endpoint: https://{accountId}.eu.r2.cloudflarestorage.com
region: auto
path-style access: true
chunked encoding: false
```

The EU jurisdiction is part of the endpoint hostname. Cloudflare states that the region value is required by S3
SDKs but unused by R2. Its Java example enables path-style access and explicitly requires chunked encoding to be
disabled; leaving SDK v2's default chunked encoding on can make R2 reject `PutObject` with HTTP 403 due to a
signature mismatch. Sources: [Cloudflare's AWS SDK for Java example](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-java/)
and [R2 jurisdiction endpoints](https://developers.cloudflare.com/r2/reference/data-location/#using-jurisdictions-with-the-s3-api).

For a browser-followable signed `GetObject` redirect, configure the presigner with the same endpoint, credentials,
`auto` region, and path-style access. Also disable checksum validation in its `S3Configuration`; AWS documents that
checksum validation can add a required signed header and make a presigned request no longer browser-compatible.
Source: [AWS `S3Presigner` API](https://docs.aws.amazon.com/java/api/latest/software/amazon/awssdk/services/s3/presigner/S3Presigner.html).

The application should bind account ID, EU endpoint, bucket name, access key, secret key, and signed-URL lifetime
to its own validated `@ConfigurationProperties`. That preserves the agreed fail-fast startup behavior. The SDK's
default credentials and region provider chains should not silently substitute for missing R2 settings.

## What the AWSpring starter would provide

`spring-cloud-aws-starter-s3` is a sound alternative if JobTrackr later wants AWSpring's higher-level S3 features.
It auto-configures the S3 integration, and `S3Template` supports uploads and signed GET URLs. It exposes properties
for the custom endpoint, region, path-style access, chunked encoding, and checksum validation. A matching R2 setup
would be:

```properties
spring.cloud.aws.s3.endpoint=https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com
spring.cloud.aws.s3.region=auto
spring.cloud.aws.s3.path-style-access-enabled=true
spring.cloud.aws.s3.chunked-encoding-enabled=false
spring.cloud.aws.s3.checksum-validation-enabled=false
```

Source: [AWSpring 4.0.2 S3 reference](https://docs.awspring.io/spring-cloud-aws/docs/4.0.2/reference/html/index.html#s3-integration).

For the current bounded R2 adapter, however, `S3Template` mostly duplicates the storage interface JobTrackr already
plans to own, and AWSpring still needs the same non-default R2 settings plus separate validation for fail-fast
startup. Direct AWS SDK v2 is therefore the smaller and clearer dependency choice.
