# Structure Candidate Evidence before tailoring

CV Generation interprets a Base CV into schema-constrained Candidate Evidence before asking the drafting model to tailor a Generated CV. This adds one model call and some latency, but separates source-understanding failures from tailoring failures, makes completeness enforceable, and prevents renderer-ready documents from being created from contact details alone.
