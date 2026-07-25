package com.ricard0g.jobtrackr_api.conversion;

public interface GotenbergClient {

    byte[] convertDocxToPdf(byte[] docxBytes, String originalFilename);
}
