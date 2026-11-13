# Discount filter — request from the product owner

Shoppers keep asking for a way to see only products that are on sale. Add a discount filter to the
product list.

## What we want

- On the product list, a viewer can choose a minimum discount: Any, 10% or more, 20% or more,
  30% or more, 50% or more.
- Only products whose discount is at least the chosen value are shown.
- The discount filter works together with the existing keyword search, price range filter, sorting
  and pagination.
- The chosen discount is kept in the URL like the other filters, so a link or Back restores it.
- Clearing the filters also clears the discount.

## Notes

- Products already have a discount percentage (for example 12.96).
- No change to how products are created or edited.
- Sorting by discount is not part of this request.
