import { useCallback, useState } from "react";
import { demoApplications } from "./demo-data";
import { formatBytes, formatDateTime } from "./format";
import { GeneratedCvPreview } from "./GeneratedCvPreview";

const documents = demoApplications
  .flatMap((application) =>
    application.generatedCvs.map((cv) => ({ application, cv })),
  )
  .sort((a, b) => b.cv.createdAt.localeCompare(a.cv.createdAt));

export function DemoDocuments() {
  const [preview, setPreview] = useState<(typeof documents)[number] | null>(
    null,
  );
  const closePreview = useCallback(() => setPreview(null), []);
  return (
    <section className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
      <h1 className="font-display text-xl font-bold">Documents</h1>
      <p className="mt-1 mb-4 text-sm text-medium-gray">
        Prepared Generated CVs for Alex Rivera, a fictional candidate.
      </p>
      <div className="overflow-x-auto rounded-card border border-light-gray bg-white">
        <table aria-label="Generated CVs" className="w-full text-left text-sm">
          <thead className="bg-off-white text-medium-gray">
            <tr>
              {[
                "Document",
                "Application",
                "Version",
                "Format",
                "Size",
                "Created",
              ].map((label) => (
                <th key={label} scope="col" className="px-4 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map(({ application, cv }) => (
              <tr
                key={`${application.id}-${cv.version}`}
                className="border-t border-light-gray"
              >
                <td className="px-4 py-3">
                  <p className="font-medium">{cv.filename}</p>
                  <button
                    type="button"
                    onClick={() => setPreview({ application, cv })}
                    className="mt-2 rounded-md border border-light-gray px-3 py-1.5 font-semibold text-accent-darkest hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-accent-dark"
                  >
                    Preview
                  </button>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{application.company}</p>
                  <p className="text-medium-gray">{application.title}</p>
                </td>
                <td className="px-4 py-3">v{cv.version}</td>
                <td className="px-4 py-3">{cv.format}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatBytes(cv.byteSize)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDateTime(cv.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview ? (
        <GeneratedCvPreview
          key={preview.cv.filename}
          application={preview.application}
          cv={preview.cv}
          onClose={closePreview}
        />
      ) : null}
    </section>
  );
}
