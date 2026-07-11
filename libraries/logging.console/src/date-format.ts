// formatTimestamp — renders a Date through a reference-style date-time format
// string. The reference passes `TimestampFormat` to the platform's date
// formatting engine; this platform has none, so a small token formatter
// implements the commonly used subset:
//
//   yyyy  4-digit year          HH  2-digit hour (00–23)
//   MM    2-digit month         hh  2-digit hour (01–12)
//   dd    2-digit day           mm  2-digit minute
//   fff   milliseconds (3)      ss  2-digit second
//   ff    centiseconds (2)      tt  AM/PM
//   f     deciseconds (1)       zzz signed UTC offset (±HH:mm)
//
// Any other character passes through verbatim. Tokens are matched longest
// first, so e.g. `mm` never splits into two `m` passthroughs.

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  offsetMinutes: number;
}

function getParts(date: Date, utc: boolean): DateParts {
  if (utc) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hours: date.getUTCHours(),
      minutes: date.getUTCMinutes(),
      seconds: date.getUTCSeconds(),
      milliseconds: date.getUTCMilliseconds(),
      offsetMinutes: 0,
    };
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
    seconds: date.getSeconds(),
    milliseconds: date.getMilliseconds(),
    // getTimezoneOffset() is minutes to ADD to local time to reach UTC, so the
    // display offset is its negation.
    offsetMinutes: -date.getTimezoneOffset(),
  };
}

function renderToken(token: string, parts: DateParts): string {
  switch (token) {
    case "yyyy": {
      return pad(parts.year, 4);
    }
    case "MM": {
      return pad(parts.month, 2);
    }
    case "dd": {
      return pad(parts.day, 2);
    }
    case "HH": {
      return pad(parts.hours, 2);
    }
    case "hh": {
      const twelve = parts.hours % 12;
      return pad(twelve === 0 ? 12 : twelve, 2);
    }
    case "mm": {
      return pad(parts.minutes, 2);
    }
    case "ss": {
      return pad(parts.seconds, 2);
    }
    case "fff": {
      return pad(parts.milliseconds, 3);
    }
    case "ff": {
      return pad(Math.floor(parts.milliseconds / 10), 2);
    }
    case "f": {
      return String(Math.floor(parts.milliseconds / 100));
    }
    case "tt": {
      return parts.hours < 12 ? "AM" : "PM";
    }
    case "zzz": {
      const sign = parts.offsetMinutes < 0 ? "-" : "+";
      const abs = Math.abs(parts.offsetMinutes);
      return `${sign}${pad(Math.floor(abs / 60), 2)}:${pad(abs % 60, 2)}`;
    }
    default: {
      return token;
    }
  }
}

const TOKEN_PATTERN = /yyyy|MM|dd|HH|hh|mm|ss|fff|ff|f|tt|zzz/g;

/** Renders `date` through `format` (see the module doc for the token subset). */
export function formatTimestamp(date: Date, format: string, utc: boolean): string {
  const parts = getParts(date, utc);
  return format.replace(TOKEN_PATTERN, (token) => renderToken(token, parts));
}
