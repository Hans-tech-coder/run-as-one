import { formatPesos } from '@/lib/money';
import { inclusionIcon } from '@/lib/inclusion-icon';
import { addOnSalesClosed, type PublicAddOn } from '@/lib/add-ons';

/**
 * The event page's left-column shop blocks: what each option includes and the
 * add-ons sold with an entry. Split out of `EventDetails.tsx`, which was on
 * the split-candidates list, when Race Details joined that column.
 */

/**
 * **Add-ons** (ADD_ONS_PLAN.md Batch 2): what a runner can add to their entry,
 * each with its poster, name and price. Bought in the wizard, per runner; this
 * is the shop window. A sold-out or closed item stays, marked (D9), and an
 * item sold with only some options says which.
 */
export function AddOnsBlock({
  addOns,
  categories,
}: {
  addOns: PublicAddOn[];
  categories: { id: string; name: string }[];
}) {
  return (
    <div className="info-block glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 hover:border-accent-blue/30 transition-colors t-stagger-line t-stagger-line--4">
      <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-white tracking-tight">Add-ons</h2>
      <p className="m-0 mb-5 sm:mb-6 text-secondary">Optional extras, picked per runner when you register.</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 list-none p-0 m-0">
        {addOns.map((addOn) => {
          const status = addOn.soldOut ? 'Sold out' : addOnSalesClosed(addOn) ? 'Sales closed' : null;
          const only = addOn.categoryIds
            .map((id) => categories.find((category) => category.id === id)?.name)
            .filter(Boolean);
          const poster = addOn.imageUrls[0];
          return (
            <li
              key={addOn.id}
              className={`flex gap-4 rounded-2xl border border-white/5 bg-black/40 p-3 sm:p-4 ${status ? 'opacity-70' : ''}`}
            >
              {poster && (
                <img
                  src={poster}
                  alt={`${addOn.name} poster`}
                  loading="lazy"
                  className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl object-cover border border-white/10 bg-black/40"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white uppercase tracking-wide leading-tight break-words">{addOn.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`text-lg font-bold tabular-nums ${status ? 'text-white/50' : 'text-accent-orange'}`}>
                    ₱{formatPesos(addOn.price)}
                  </span>
                  {status && (
                    <span className="text-xs font-bold uppercase tracking-wide text-white/70 bg-white/10 border border-white/10 px-2.5 py-0.5 rounded-full">
                      {status}
                    </span>
                  )}
                </div>
                {addOn.description && (
                  <p className="m-0 mt-1 text-sm text-secondary line-clamp-3">{addOn.description}</p>
                )}
                {only.length > 0 && (
                  <p className="m-0 mt-1 text-xs text-secondary">With {only.join(', ')} only</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One option's inclusions, as a plain list.
 *
 * Every row used to be a bordered, tinted card holding a 48px tile with the
 * same check in it, which made four short words stand three lines tall and gave
 * a five-item list the weight of the whole page. What a runner is reading here
 * is a list, so it looks like one: an icon, the words, nothing else.
 *
 * The icon is chosen from the text (lib/inclusion-icon), so the shirt line
 * draws a shirt and the medal line a medal — that is what makes the list
 * scannable now that the cards are gone.
 */
export function InclusionsGrid({ items }: { items: string[] }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 sm:gap-y-4 list-none p-0 m-0">
      {items.map((item, idx) => {
        const Icon = inclusionIcon(item);
        return (
          <li key={idx} className="flex items-start gap-3">
            <Icon
              className="text-accent-blue h-5 w-5 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="font-medium text-white/90 text-sm sm:text-base leading-relaxed">
              {item}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
