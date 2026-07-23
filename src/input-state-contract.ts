import type { PlatformOps } from "./platform.ts";
import { invalidArgument } from "./errors.ts";
import { INPUT_TYPES, type InputType } from "./vocabularies.ts";

const CHECKABLE_INPUT_TYPES = Object.freeze(["checkbox", "radio"] as const);
const RANGE_INPUT_TYPES = Object.freeze([
  "date", "month", "week", "time", "datetime-local", "number", "range",
] as const);
const TEXT_INPUT_TYPES = Object.freeze([
  "text", "search", "tel", "url", "email",
] as const);
const READONLY_INPUT_TYPES = Object.freeze([
  ...TEXT_INPUT_TYPES, "date", "month", "week", "time", "datetime-local", "number",
] as const);
const PLACEHOLDER_INPUT_TYPES = Object.freeze([...TEXT_INPUT_TYPES, "number"] as const);
const REQUIRED_INPUT_TYPES = Object.freeze([
  ...TEXT_INPUT_TYPES, "date", "month", "week", "time", "datetime-local", "number",
  "checkbox", "radio",
] as const);
const AUTOCOMPLETE_INPUT_TYPES = Object.freeze([
  ...TEXT_INPUT_TYPES, ...RANGE_INPUT_TYPES, "color",
] as const);

type ComparablePart = bigint | number;

interface ParsedRangeValue {
  readonly comparable: readonly ComparablePart[];
}

const HTML_FLOAT = /^-?(?:(?:[0-9]+(?:\.[0-9]+)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?$/;
const HTML_MONTH = /^([0-9]{4,})-([0-9]{2})$/;
const HTML_DATE = /^([0-9]{4,})-([0-9]{2})-([0-9]{2})$/;
const HTML_WEEK = /^([0-9]{4,})-W([0-9]{2})$/;
const HTML_TIME = /^([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,3}))?)?$/;
const HTML_LOCAL_DATE_TIME = /^([0-9]{4,})-([0-9]{2})-([0-9]{2})([T ])([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,3}))?)?$/;

function includes<Value extends string>(values: readonly Value[], value: string): value is Value {
  for (const candidate of values) {
    if (candidate === value) return true;
  }
  return false;
}

export function getInputType(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  const current = platform.getInputType(element);
  if (!includes(INPUT_TYPES, current)) throw invalidArgument(operation);
  return current;
}

function requireInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  applicable: readonly InputType[],
  operation: string,
): InputType {
  const current = getInputType(platform, element, operation);
  if (!includes(applicable, current)) throw invalidArgument(operation);
  return current;
}

export function requireCheckableInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  return requireInputState(platform, element, CHECKABLE_INPUT_TYPES, operation);
}

export function requireRangeInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  return requireInputState(platform, element, RANGE_INPUT_TYPES, operation);
}

export function requireTextInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  return requireInputState(platform, element, TEXT_INPUT_TYPES, operation);
}

export function requireReadonlyInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  return requireInputState(platform, element, READONLY_INPUT_TYPES, operation);
}

export function requirePlaceholderInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  return requireInputState(platform, element, PLACEHOLDER_INPUT_TYPES, operation);
}

export function requireRequiredInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  return requireInputState(platform, element, REQUIRED_INPUT_TYPES, operation);
}

export function requireAutocompleteInputState(
  platform: PlatformOps,
  element: HTMLInputElement,
  operation: string,
): InputType {
  return requireInputState(platform, element, AUTOCOMPLETE_INPUT_TYPES, operation);
}

export function isCheckableInputType(type: InputType): boolean {
  return includes(CHECKABLE_INPUT_TYPES, type);
}

export function inputTypeSupportsAutocomplete(type: InputType): boolean {
  return includes(AUTOCOMPLETE_INPUT_TYPES, type);
}

export function parseInputRangeValue(
  type: InputType,
  value: string,
  operation: string,
): ParsedRangeValue {
  if (type === "number" || type === "range") return parseFloatingPoint(value, operation);
  if (type === "month") return parseMonth(value, operation);
  if (type === "date") return parseDate(value, operation);
  if (type === "week") return parseWeek(value, operation);
  if (type === "time") return parseTime(value, operation);
  if (type === "datetime-local") return parseLocalDateTime(value, operation);
  throw invalidArgument(operation);
}

export function parseInputStep(value: string, operation: string): string {
  if (value === "any") return value;
  const parsed = parseFloatingPoint(value, operation).comparable[0];
  if (typeof parsed !== "number" || parsed <= 0) throw invalidArgument(operation);
  return value;
}

export function compareInputRangeValues(left: ParsedRangeValue, right: ParsedRangeValue): number {
  const length = Math.max(left.comparable.length, right.comparable.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.comparable[index];
    const rightPart = right.comparable[index];
    if (leftPart === undefined || rightPart === undefined) return left.comparable.length - right.comparable.length;
    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }
  return 0;
}

export function assertInputTypeTransition(
  platform: PlatformOps,
  element: HTMLInputElement,
  target: InputType,
): InputType {
  const operation = "SafeInputElement.setType.state";
  const current = getInputType(platform, element, operation);
  const min = platform.getAttribute(element, "min");
  const max = platform.getAttribute(element, "max");
  const step = platform.getAttribute(element, "step");
  if (min !== null || max !== null || step !== null) {
    if (!includes(RANGE_INPUT_TYPES, target)) throw invalidArgument(operation);
    const parsedMin = min === null ? null : parseInputRangeValue(target, min, operation);
    const parsedMax = max === null ? null : parseInputRangeValue(target, max, operation);
    if (
      target !== "time" &&
      parsedMin !== null &&
      parsedMax !== null &&
      compareInputRangeValues(parsedMin, parsedMax) > 0
    ) {
      throw invalidArgument(operation);
    }
    if (step !== null) parseInputStep(step, operation);
  }

  const minimumLengthAttribute = platform.getAttribute(element, "minlength");
  const maximumLengthAttribute = platform.getAttribute(element, "maxlength");
  const pattern = platform.getAttribute(element, "pattern");
  if (minimumLengthAttribute !== null || maximumLengthAttribute !== null || pattern !== null) {
    if (!includes(TEXT_INPUT_TYPES, target)) throw invalidArgument(operation);
    const minimumLength = platform.getInputMinLength(element);
    const maximumLength = platform.getInputMaxLength(element);
    if (
      (minimumLengthAttribute !== null && minimumLength < 0) ||
      (maximumLengthAttribute !== null && maximumLength < 0) ||
      (minimumLength >= 0 && maximumLength >= 0 && minimumLength > maximumLength) ||
      (pattern !== null && !platform.isInputPatternValid(pattern))
    ) {
      throw invalidArgument(operation);
    }
  }

  if (!includes(CHECKABLE_INPUT_TYPES, target) && platform.getInputChecked(element)) {
    throw invalidArgument(operation);
  }
  if (platform.getAttribute(element, "readonly") !== null && !includes(READONLY_INPUT_TYPES, target)) {
    throw invalidArgument(operation);
  }
  if (platform.getAttribute(element, "placeholder") !== null && !includes(PLACEHOLDER_INPUT_TYPES, target)) {
    throw invalidArgument(operation);
  }
  if (platform.getAttribute(element, "required") !== null && !includes(REQUIRED_INPUT_TYPES, target)) {
    throw invalidArgument(operation);
  }
  return current;
}

function parseFloatingPoint(value: string, operation: string): ParsedRangeValue {
  if (!HTML_FLOAT.test(value)) throw invalidArgument(operation);
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) throw invalidArgument(operation);
  return { comparable: [number] };
}

function parseMonth(value: string, operation: string): ParsedRangeValue {
  const match = HTML_MONTH.exec(value);
  const yearText = match?.[1];
  const monthText = match?.[2];
  if (yearText === undefined || monthText === undefined) throw invalidArgument(operation);
  const year = BigInt(yearText);
  const month = Number.parseInt(monthText, 10);
  if (year <= 0n || month < 1 || month > 12) throw invalidArgument(operation);
  return { comparable: [year, month] };
}

function parseDate(value: string, operation: string): ParsedRangeValue {
  const match = HTML_DATE.exec(value);
  return { comparable: parseDateParts(match?.[1], match?.[2], match?.[3], operation) };
}

function parseDateParts(
  yearText: string | undefined,
  monthText: string | undefined,
  dayText: string | undefined,
  operation: string,
): readonly ComparablePart[] {
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    throw invalidArgument(operation);
  }
  const year = BigInt(yearText);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  if (year <= 0n || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw invalidArgument(operation);
  }
  return [year, month, day];
}

function parseWeek(value: string, operation: string): ParsedRangeValue {
  const match = HTML_WEEK.exec(value);
  const yearText = match?.[1];
  const weekText = match?.[2];
  if (yearText === undefined || weekText === undefined) throw invalidArgument(operation);
  const year = BigInt(yearText);
  const week = Number.parseInt(weekText, 10);
  if (year <= 0n || week < 1 || week > weeksInYear(year)) throw invalidArgument(operation);
  return { comparable: [year, week] };
}

function parseTime(value: string, operation: string): ParsedRangeValue {
  const match = HTML_TIME.exec(value);
  if (match === null) throw invalidArgument(operation);
  return parseTimeMatch(match[1], match[2], match[3], match[4], operation);
}

function parseLocalDateTime(value: string, operation: string): ParsedRangeValue {
  const match = HTML_LOCAL_DATE_TIME.exec(value);
  const date = parseDateParts(match?.[1], match?.[2], match?.[3], operation);
  const time = parseTimeMatch(match?.[5], match?.[6], match?.[7], match?.[8], operation);
  return { comparable: [...date, ...time.comparable] };
}

function parseTimeMatch(
  hourText: string | undefined,
  minuteText: string | undefined,
  secondText: string | undefined,
  fractionText: string | undefined,
  operation: string,
): ParsedRangeValue {
  if (hourText === undefined || minuteText === undefined) throw invalidArgument(operation);
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const second = secondText === undefined ? 0 : Number.parseInt(secondText, 10);
  const millisecond = fractionText === undefined ? 0 : Number.parseInt(fractionText.padEnd(3, "0"), 10);
  if (hour > 23 || minute > 59 || second > 59) throw invalidArgument(operation);
  return { comparable: [hour, minute, second, millisecond] };
}

function isLeapYear(year: bigint): boolean {
  return year % 400n === 0n || (year % 4n === 0n && year % 100n !== 0n);
}

function daysInMonth(year: bigint, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function weeksInYear(year: bigint): number {
  const precedingYears = year - 1n;
  const daysBeforeYear = precedingYears * 365n
    + precedingYears / 4n
    - precedingYears / 100n
    + precedingYears / 400n;
  const januaryFirstRemainder = daysBeforeYear % 7n;
  let januaryFirst = 6;
  if (januaryFirstRemainder === 0n) januaryFirst = 0;
  else if (januaryFirstRemainder === 1n) januaryFirst = 1;
  else if (januaryFirstRemainder === 2n) januaryFirst = 2;
  else if (januaryFirstRemainder === 3n) januaryFirst = 3;
  else if (januaryFirstRemainder === 4n) januaryFirst = 4;
  else if (januaryFirstRemainder === 5n) januaryFirst = 5;
  return januaryFirst === 3 || (januaryFirst === 2 && isLeapYear(year)) ? 53 : 52;
}
