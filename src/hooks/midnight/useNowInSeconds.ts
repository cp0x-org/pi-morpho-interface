import { useEffect, useState } from 'react';

import { nowInSeconds } from 'utils/midnight';

/** Current unix time (bigint seconds) refreshed on an interval, so maturity countdowns and APRs stay current without re-rendering on every tick. */
export const useNowInSeconds = (intervalMs = 60_000) => {
  const [now, setNow] = useState(nowInSeconds);

  useEffect(() => {
    const timer = setInterval(() => setNow(nowInSeconds()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
};
