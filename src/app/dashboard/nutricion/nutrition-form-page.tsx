import type { ComponentProps } from "react";
import { FormPage } from "@/app/dashboard/form-page";

/**
 * FormPage inside the Nutrición layout, which already pads the content: the
 * negative margins cancel FormPage's own padding so the form lines up with the tabs.
 */
export function NutritionFormPage(props: ComponentProps<typeof FormPage>) {
  return (
    <div className="-m-4 md:-m-8">
      <FormPage {...props} />
    </div>
  );
}
