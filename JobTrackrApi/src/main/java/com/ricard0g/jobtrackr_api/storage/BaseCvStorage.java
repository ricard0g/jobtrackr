package com.ricard0g.jobtrackr_api.storage;

import java.net.URI;

public interface BaseCvStorage {

    void upload(String objectKey, byte[] bytes, String contentType);

    URI createDownloadUri(String objectKey, String originalFilename);

    void delete(String objectKey);
}
