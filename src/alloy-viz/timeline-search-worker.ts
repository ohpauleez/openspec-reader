import { searchTimelineRecords } from './timeline-search';
import type { TimelineSearchRecord } from './timeline-search';

/** Search runs off the UI thread; the caller terminates this worker after its deadline or replacement query. */
self.onmessage = (event: MessageEvent<{ records: TimelineSearchRecord[]; query: string }>) => {
  try { self.postMessage({ ...searchTimelineRecords(event.data.records, event.data.query) }); }
  catch (error) { self.postMessage({ error: String(error) }); }
};
