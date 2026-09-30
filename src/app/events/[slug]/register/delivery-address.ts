import { findProvince, isKnownCity } from "@/lib/ph-address";
import { phoneNumberError } from "@/lib/phone";

/**
 * What a complete delivery address is, shared by both registration wizards.
 *
 * The runner fills the address in parts — house and street, then barangay,
 * city/municipality and province picked from the PSGC lists (lib/ph-address.ts),
 * an optional ZIP code and landmark, and, when someone other than Runner 1 will
 * receive the kit, that person's name and mobile number. The parts are joined
 * into the one `deliveryAddress` column every existing reader (the registrant
 * table, the CSV export, the confirmation email) already prints, so no reader
 * had to change. `parseDeliveryAddress` reverses the join — for the
 * cancelled-checkout restore, and for the checkout routes, which read the
 * province back to price delivery; anything it cannot split lands whole in the
 * street field rather than being lost.
 */

export interface DeliveryAddressParts {
  street: string;
  barangay: string;
  city: string;
  province: string;
  zip: string;
  landmark: string;
  /** Someone other than Runner 1 receives the kit. */
  otherReceiver: boolean;
  receiverName: string;
  /** E.164, as PhoneField writes it. */
  receiverPhone: string;
}

export type DeliveryAddressPart = Exclude<
  keyof DeliveryAddressParts,
  "otherReceiver"
>;

export const EMPTY_DELIVERY_ADDRESS: DeliveryAddressParts = {
  street: "",
  barangay: "",
  city: "",
  province: "",
  zip: "",
  landmark: "",
  otherReceiver: false,
  receiverName: "",
  receiverPhone: "",
};

/** The name each part goes by in labels and validation messages. */
export const ADDRESS_PART_LABELS: Record<DeliveryAddressPart, string> = {
  street: "House/Unit No. & Street",
  barangay: "Barangay",
  city: "City/Municipality",
  province: "Province",
  zip: "ZIP Code",
  landmark: "Landmark / Delivery Instructions",
  receiverName: "Receiver's Name",
  receiverPhone: "Receiver's Mobile Number",
};

export function addressPartFieldId(part: DeliveryAddressPart): string {
  return `delivery-${part}`;
}

/** A Philippine ZIP code is four digits. Blank is fine: the field is optional. */
export function isValidZip(zip: string): boolean {
  return zip.trim() === "" || /^\d{4}$/.test(zip.trim());
}

/**
 * Why each part is not good enough yet, in form order. Empty means complete.
 *
 * The province has to be one on the list, because delivery is priced from it.
 * The city is checked against its province's list whenever that list has been
 * loaded in this page, which the form does as soon as a province is picked.
 * The barangay is not held to the list: a barangay newer than the data must
 * still be deliverable to.
 */
export function addressProblems(
  parts: DeliveryAddressParts,
): Partial<Record<DeliveryAddressPart, string>> {
  const problems: Partial<Record<DeliveryAddressPart, string>> = {};
  // Form order, top to bottom: the first key is where the caret is sent.
  if (!findProvince(parts.province)) {
    problems.province = "Choose your province from the list";
  }
  if (!parts.city.trim() || isKnownCity(parts.province, parts.city) === false) {
    problems.city = "Choose your city or municipality from the list";
  }
  if (!parts.barangay.trim()) problems.barangay = "Choose your barangay";
  if (!isValidZip(parts.zip)) problems.zip = "A ZIP code is 4 digits";
  if (!parts.street.trim()) {
    problems.street = "Enter your house/unit number and street";
  }
  if (parts.otherReceiver) {
    if (!parts.receiverName.trim()) {
      problems.receiverName = "Enter the name of the person receiving the kit";
    }
    const phone = parts.receiverPhone.trim()
      ? phoneNumberError(parts.receiverPhone)
      : "Enter the receiver's mobile number";
    if (phone) problems.receiverPhone = phone;
  }
  return problems;
}

export function missingAddressParts(
  parts: DeliveryAddressParts,
): DeliveryAddressPart[] {
  return Object.keys(addressProblems(parts)) as DeliveryAddressPart[];
}

const SEPARATOR = " — ";
const LANDMARK = "LANDMARK: ";
const RECEIVER = "RECEIVER: ";

/** Free text may not contain the separator, or the join could not be undone. */
function freeText(value: string): string {
  return value.replace(/—/g, "-").replace(/\s+/g, " ").trim();
}

/** Barangay, city and province are names, so a comma in one is a typo — and
 *  it would make the joined address impossible to split back apart. */
function singleName(value: string): string {
  return freeText(value.replace(/,/g, " "));
}

/**
 * "BLK 5 LOT 12 RIZAL ST., SAN ISIDRO, TARLAC CITY, TARLAC 2300
 *  — LANDMARK: BLUE GATE — RECEIVER: MARIA SANTOS, +639171234567"
 * Returns "" when nothing was entered, so an empty form still reads as blank.
 */
export function composeDeliveryAddress(parts: DeliveryAddressParts): string {
  const province = [singleName(parts.province), parts.zip.trim()]
    .filter(Boolean)
    .join(" ");
  const segments = [
    [freeText(parts.street), singleName(parts.barangay), singleName(parts.city), province]
      .filter(Boolean)
      .join(", "),
  ];
  const landmark = freeText(parts.landmark);
  if (landmark) segments.push(`${LANDMARK}${landmark}`);
  if (parts.otherReceiver && (parts.receiverName.trim() || parts.receiverPhone)) {
    segments.push(
      `${RECEIVER}${singleName(parts.receiverName)}, ${parts.receiverPhone.trim()}`,
    );
  }
  return segments.join(SEPARATOR);
}

export function parseDeliveryAddress(
  stored: string | null | undefined,
): DeliveryAddressParts {
  if (!stored) return { ...EMPTY_DELIVERY_ADDRESS };

  const [address, ...rest] = stored.split(SEPARATOR);
  const parts = { ...EMPTY_DELIVERY_ADDRESS };
  for (const segment of rest) {
    if (segment.startsWith(LANDMARK)) {
      parts.landmark = segment.slice(LANDMARK.length);
    } else if (segment.startsWith(RECEIVER)) {
      const receiver = segment.slice(RECEIVER.length);
      const comma = receiver.lastIndexOf(", ");
      parts.otherReceiver = true;
      parts.receiverName = comma === -1 ? receiver : receiver.slice(0, comma);
      parts.receiverPhone = comma === -1 ? "" : receiver.slice(comma + 2);
    }
  }

  // The street may carry commas of its own, so it takes whatever is left once
  // the last three comma-free names have been peeled off the end.
  const match = /^(.+), ([^,]+), ([^,]+), ([^,]+?)(?: (\d{4}))?$/.exec(address);
  if (!match) {
    // An address typed into the old single box: keep every word of it.
    return { ...EMPTY_DELIVERY_ADDRESS, street: stored };
  }

  const [, street, barangay, city, province, zip = ""] = match;
  return { ...parts, street, barangay, city, province, zip };
}
