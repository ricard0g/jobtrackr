package com.ricard0g.jobtrackr_api.storage;

import java.net.URI;

public interface BaseCvStorage {

    void upload(String objectKey, byte[] bytes, String contentType);

    byte[] download(String objectKey);

    boolean exists(String objectKey);

    URI createDownloadUri(String objectKey, String originalFilename);

    void delete(String objectKey);
}
