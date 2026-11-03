/* eslint-disable */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, CirclePlus, ImagePlus, Upload, X } from "lucide-react";
import * as React from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { toast as sonnerToast } from "sonner";

function toast({
  title,
  description,
  variant = "default",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
}) {
  if (variant === "destructive") {
    return sonnerToast.error(title, { description });
  }
  return sonnerToast(title, { description });
}

const requiredString = (message: string, min = 1) =>
  z.string().min(min, message);

const variantSchema = z.object({
  option: requiredString("Choose an option"),
  value: requiredString("Enter a value"),
  price: requiredString("Enter a price"),
  quantity: requiredString("Enter a quantity"),
});

const formSchema = z.object({
  name: requiredString("Product name is required", 2),
  sku: requiredString("SKU is required", 3),
  barcode: z.string().optional(),
  description: z
    .string()
    .max(280, "Keep the description under 280 characters")
    .optional(),
  vendor: z.string().optional(),
  basePrice: requiredString("Base price is required"),
  discountedPrice: z.string().optional(),
  currency: z.enum(["USD", "EUR", "GBP"]),
  chargeTax: z.boolean(),
  inStock: z.boolean(),
  status: z.enum(["draft", "active", "scheduled"]),
  category: requiredString("Select a category"),
  subcategory: requiredString("Select a sub category"),
  tags: z.string().optional(),
  variants: z.array(variantSchema).min(1, "Add at least one variant"),
});

type AddProductValues = z.infer<typeof formSchema>;
type ProductEditorMode = "add" | "edit";
type ProductEditorAssets = {
  thumbnail: string;
  gallery: string[];
};

type MediaPreviewItem = {
  id: string;
  src: string;
  source: "default" | "upload";
};

const MAX_PRODUCT_MEDIA_ITEMS = 5;

const categoryOptions = [
  {
    value: "skin-care",
    label: "Skin care",
    subcategories: [
      { value: "serums", label: "Serums" },
      { value: "creams", label: "Creams" },
      { value: "cleansers", label: "Cleansers" },
    ],
  },
  {
    value: "body-care",
    label: "Body care",
    subcategories: [
      { value: "lotions", label: "Lotions" },
      { value: "scrubs", label: "Scrubs" },
      { value: "oils", label: "Oils" },
    ],
  },
  {
    value: "wellness",
    label: "Wellness",
    subcategories: [
      { value: "bundles", label: "Bundles" },
      { value: "supplements", label: "Supplements" },
      { value: "essentials", label: "Essentials" },
    ],
  },
] as const;

const variantOptions = [
  { value: "size", label: "Size" },
  { value: "color", label: "Color" },
  { value: "bundle", label: "Bundle" },
  { value: "scent", label: "Scent" },
] as const;

const defaultValues: AddProductValues = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  vendor: "",
  basePrice: "",
  discountedPrice: "",
  currency: "USD",
  chargeTax: false,
  inStock: false,
  status: "draft",
  category: "",
  subcategory: "",
  tags: "",
  variants: [{ option: "", value: "", price: "", quantity: "" }],
};

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
] as const;

function cloneProductValues(values: AddProductValues): AddProductValues {
  return {
    ...values,
    variants: values.variants.map((variant) => ({ ...variant })),
  };
}

function MediaSection({
  items,
  inputRef,
  onInputChange,
  onRemove,
}: {
  items: MediaPreviewItem[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <input
          ref={inputRef}
          id="product-media-upload"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={onInputChange}
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((image, index) => (
            <div
              key={image.id}
              className={cn(
                "relative aspect-square overflow-hidden rounded-2xl border bg-muted/30",
                index === 0 && "md:col-span-2 md:row-span-2 md:aspect-auto",
              )}
            >
              <img
                src={image.src}
                alt={`Product media ${index + 1}`}
                className="absolute inset-0 size-full object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 size-7 rounded-full shadow-sm"
                onClick={() => onRemove(image.id)}
              >
                <X />
              </Button>
            </div>
          ))}

          {items.length < MAX_PRODUCT_MEDIA_ITEMS ? (
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "flex aspect-square h-auto flex-col gap-2 rounded-2xl border border-dashed border-muted-foreground/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                items.length === 1 && "md:col-span-2",
              )}
              asChild
            >
              <label htmlFor="product-media-upload">
                <ImagePlus />
                <span className="text-sm font-medium">Add images</span>
              </label>
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {items.length} of {MAX_PRODUCT_MEDIA_ITEMS} media assets selected.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <label htmlFor="product-media-upload">
                <Upload data-icon="inline-start" />
                Add more images
              </label>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-14 text-center">
      <input
        ref={inputRef}
        id="product-media-upload"
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={onInputChange}
      />
      <div className="flex size-14 items-center justify-center rounded-full border bg-muted">
        <ImagePlus className="size-6 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">Drop your images here</p>
        <p className="text-sm text-muted-foreground">
          PNG or JPG up to 5MB. Add up to 5 product media assets.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="outline" asChild>
          <label htmlFor="product-media-upload">
            <Upload data-icon="inline-start" />
            Select images
          </label>
        </Button>
      </div>
    </div>
  );
}

function EcommerceEditProduct({
  initialValues,
  assets,
}: {
  initialValues: AddProductValues;
  assets: ProductEditorAssets;
}) {
  return (
    <EcommerceProductEditor
      mode="edit"
      initialValues={initialValues}
      assets={assets}
    />
  );
}

function EcommerceProductEditor({
  mode,
  initialValues,
  assets,
}: {
  mode: ProductEditorMode;
  initialValues: AddProductValues;
  assets?: ProductEditorAssets;
}) {
  const form = useForm<AddProductValues>({
    resolver: zodResolver(formSchema),
    defaultValues: cloneProductValues(initialValues),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variants",
  });
  const thumbnailInputRef = React.useRef<HTMLInputElement>(null);
  const mediaInputRef = React.useRef<HTMLInputElement>(null);
  const [thumbnailFile, setThumbnailFile] = React.useState<File | null>(null);
  const [thumbnailCleared, setThumbnailCleared] = React.useState(false);
  const initialMediaItems = React.useMemo<MediaPreviewItem[]>(
    () =>
      mode === "edit" && assets?.gallery.length
        ? assets.gallery.map((src, index) => ({
            id: `default-${index}`,
            src,
            source: "default",
          }))
        : [],
    [assets?.gallery, mode],
  );
  const [mediaItems, setMediaItems] =
    React.useState<MediaPreviewItem[]>(initialMediaItems);
  const mediaItemsRef = React.useRef<MediaPreviewItem[]>(initialMediaItems);

  const selectedCategory = form.watch("category");
  const selectedCurrency = form.watch("currency");
  const selectedCategoryConfig = categoryOptions.find(
    (category) => category.value === selectedCategory,
  );
  const subcategoryOptions = selectedCategoryConfig?.subcategories ?? [];
  const pageTitle = mode === "add" ? "Add Product" : "Edit Product";
  const pageDescription =
    mode === "add"
      ? "Build a polished product record with pricing, media, availability, and variant data."
      : "Update pricing, media, availability, and variant data without leaving the catalog flow.";
  const primaryActionLabel = mode === "add" ? "Save Product" : "Update product";
  const successTitle = mode === "add" ? "Product added" : "Product updated";
  const successDescription =
    mode === "add"
      ? (productName: string) =>
          `${productName} is ready for pricing and media review.`
      : (productName: string) =>
          `${productName} was updated and synced to the catalog view.`;
  const defaultThumbnail = mode === "edit" ? assets?.thumbnail : undefined;
  const [thumbnailPreview, setThumbnailPreview] = React.useState<
    string | undefined
  >(defaultThumbnail);

  React.useEffect(() => {
    form.reset(cloneProductValues(initialValues));
  }, [form, initialValues]);

  React.useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  React.useEffect(() => {
    setMediaItems((current) => {
      current
        .filter((item) => item.source === "upload")
        .forEach((item) => URL.revokeObjectURL(item.src));

      return initialMediaItems;
    });

    if (mediaInputRef.current) {
      mediaInputRef.current.value = "";
    }
  }, [initialMediaItems]);

  React.useEffect(() => {
    return () => {
      mediaItemsRef.current
        .filter((item) => item.source === "upload")
        .forEach((item) => URL.revokeObjectURL(item.src));
    };
  }, []);

  React.useEffect(() => {
    if (thumbnailFile) {
      const nextPreview = URL.createObjectURL(thumbnailFile);
      setThumbnailPreview(nextPreview);

      return () => URL.revokeObjectURL(nextPreview);
    }

    setThumbnailPreview(thumbnailCleared ? undefined : defaultThumbnail);
  }, [defaultThumbnail, thumbnailCleared, thumbnailFile]);

  React.useEffect(() => {
    if (!selectedCategory) {
      if (form.getValues("subcategory")) {
        form.setValue("subcategory", "", {
          shouldDirty: true,
        });
      }

      return;
    }

    const currentSubcategory = form.getValues("subcategory");
    const nextSubcategoryOptions =
      categoryOptions.find((category) => category.value === selectedCategory)
        ?.subcategories ?? [];
    const isCurrentValid = nextSubcategoryOptions.some(
      (subcategory) => subcategory.value === currentSubcategory,
    );

    if (!isCurrentValid && nextSubcategoryOptions[0]) {
      form.setValue("subcategory", nextSubcategoryOptions[0].value, {
        shouldDirty: true,
      });
    }
  }, [form, selectedCategory]);

  const handleSubmit = (values: AddProductValues) => {
    toast({
      title: successTitle,
      description: successDescription(values.name),
    });
  };

  const handleSaveDraft = form.handleSubmit((values) => {
    form.setValue("status", "draft", { shouldDirty: true });
    toast({
      title: "Draft saved",
      description: `${values.name || "Untitled product"} was saved as a draft.`,
    });
  });

  function handleThumbnailChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) return;

    setThumbnailCleared(false);
    setThumbnailFile(nextFile);
  }

  function handleRemoveThumbnail() {
    setThumbnailFile(null);
    setThumbnailCleared(true);

    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  }

  function handleResetEditor() {
    form.reset(cloneProductValues(initialValues));
    setThumbnailFile(null);
    setThumbnailCleared(false);
    setMediaItems((current) => {
      current
        .filter((item) => item.source === "upload")
        .forEach((item) => URL.revokeObjectURL(item.src));

      return initialMediaItems;
    });

    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }

    if (mediaInputRef.current) {
      mediaInputRef.current.value = "";
    }
  }

  function handleMediaInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    if (!nextFiles.length) return;

    setMediaItems((current) => {
      const remainingSlots = Math.max(
        MAX_PRODUCT_MEDIA_ITEMS - current.length,
        0,
      );
      const acceptedFiles = nextFiles.slice(0, remainingSlots);

      if (acceptedFiles.length < nextFiles.length) {
        toast({
          title: "Media limit reached",
          description: "You can keep up to 5 product media assets.",
        });
      }

      const uploadedItems = acceptedFiles.map((file, index) => ({
        id: `upload-${file.name}-${file.lastModified}-${current.length + index}`,
        src: URL.createObjectURL(file),
        source: "upload" as const,
      }));

      return [...current, ...uploadedItems];
    });

    event.target.value = "";
  }

  function handleRemoveMediaItem(id: string) {
    setMediaItems((current) => {
      const nextItem = current.find((item) => item.id === id);

      if (nextItem?.source === "upload") {
        URL.revokeObjectURL(nextItem.src);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6 md:p-8">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 pb-8">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-sm md:hidden">
                <span className="font-medium text-foreground">Products</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground">{pageTitle}</span>
              </div>

              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {pageTitle}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {pageDescription}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleResetEditor}
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSaveDraft()}
              >
                Save draft
              </Button>
              <Button form="add-product-form" type="submit">
                {primaryActionLabel}
              </Button>
            </div>
          </header>

          <form
            id="add-product-form"
            onSubmit={form.handleSubmit(handleSubmit)}
            className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.78fr)]"
          >
            <div className="flex min-w-0 flex-col gap-6">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Product Info</CardTitle>
                  <CardDescription>
                    Set the essentials customers need to identify and trust this
                    item.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <FieldSet className="gap-4">
                      <FieldLegend variant="label">Thumbnail</FieldLegend>
                      <Field orientation="horizontal" className="items-start">
                        <div className="relative">
                          <input
                            ref={thumbnailInputRef}
                            id="product-thumbnail-upload"
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleThumbnailChange}
                          />
                          {thumbnailPreview ? (
                            <div className="relative size-20 overflow-hidden rounded-2xl border bg-muted/30">
                              <img
                                src={thumbnailPreview}
                                alt={`${initialValues.name || "Product"} thumbnail`}
                                className="absolute inset-0 size-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex size-20 items-center justify-center rounded-2xl border border-dashed bg-muted/50">
                              <ImagePlus className="size-5 text-muted-foreground/70" />
                            </div>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute right-1 bottom-1 size-7 rounded-full border bg-background shadow-sm"
                            asChild
                          >
                            <label htmlFor="product-thumbnail-upload">
                              <Camera />
                            </label>
                          </Button>
                        </div>
                        <FieldContent>
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-medium">
                              Product thumbnail
                            </p>
                            <p className="text-xs text-muted-foreground">
                              JPG or PNG. Keep it square and at least 1000 by
                              1000 pixels.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button type="button" variant="ghost" asChild>
                              <label htmlFor="product-thumbnail-upload">
                                {thumbnailPreview
                                  ? "Replace image"
                                  : "Upload image"}
                              </label>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={handleRemoveThumbnail}
                              disabled={!thumbnailPreview}
                            >
                              Remove
                            </Button>
                          </div>
                        </FieldContent>
                      </Field>
                    </FieldSet>

                    <Controller
                      control={form.control}
                      name="name"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="product-name">Name</FieldLabel>
                          <Input
                            {...field}
                            id="product-name"
                            aria-invalid={fieldState.invalid}
                            placeholder="Shirt, t-shirts, etc."
                          />
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <FieldGroup className="md:grid md:grid-cols-2 md:gap-4">
                      <Controller
                        control={form.control}
                        name="sku"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="product-sku">SKU</FieldLabel>
                            <Input
                              {...field}
                              id="product-sku"
                              aria-invalid={fieldState.invalid}
                              placeholder="eg. 348121032"
                            />
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />

                      <Controller
                        control={form.control}
                        name="barcode"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="product-barcode">
                              Barcode
                            </FieldLabel>
                            <Input
                              {...field}
                              id="product-barcode"
                              aria-invalid={fieldState.invalid}
                              placeholder="0123456789012"
                            />
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    </FieldGroup>

                    <Controller
                      control={form.control}
                      name="description"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="product-description">
                            Description
                          </FieldLabel>
                          <Textarea
                            {...field}
                            id="product-description"
                            aria-invalid={fieldState.invalid}
                            placeholder="Set a description to the product for better visibility."
                            className="min-h-32 resize-y"
                          />
                          <FieldDescription>
                            A concise summary helps merchants and customers scan
                            the catalog faster.
                          </FieldDescription>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <CardTitle>Media</CardTitle>
                    <CardDescription>
                      Showcase the product from multiple angles before
                      publishing.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <MediaSection
                    items={mediaItems}
                    inputRef={mediaInputRef}
                    onInputChange={handleMediaInputChange}
                    onRemove={handleRemoveMediaItem}
                  />
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Variants</CardTitle>
                  <CardDescription>
                    Configure alternate sizes, bundles, or colors with their own
                    inventory.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldSet className="gap-4">
                    <FieldGroup className="gap-4">
                      {fields.map((variantField, index) => (
                        <FieldGroup
                          key={variantField.id}
                          className="rounded-2xl border p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_120px_auto] lg:items-end lg:gap-3"
                        >
                          <Controller
                            control={form.control}
                            name={`variants.${index}.option`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`variant-option-${index}`}>
                                  Option
                                </FieldLabel>
                                <Select
                                  value={field.value}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger
                                    id={`variant-option-${index}`}
                                    aria-invalid={fieldState.invalid}
                                  >
                                    <SelectValue placeholder="Select option" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {variantOptions.map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <Controller
                            control={form.control}
                            name={`variants.${index}.value`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`variant-value-${index}`}>
                                  Value
                                </FieldLabel>
                                <Input
                                  {...field}
                                  id={`variant-value-${index}`}
                                  aria-invalid={fieldState.invalid}
                                  placeholder="50 ml"
                                />
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <Controller
                            control={form.control}
                            name={`variants.${index}.price`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`variant-price-${index}`}>
                                  Price
                                </FieldLabel>
                                <InputGroup>
                                  <InputGroupAddon align="inline-start">
                                    <InputGroupText>
                                      {selectedCurrency}
                                    </InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    {...field}
                                    id={`variant-price-${index}`}
                                    aria-invalid={fieldState.invalid}
                                    inputMode="decimal"
                                    placeholder="45.00"
                                  />
                                </InputGroup>
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <Controller
                            control={form.control}
                            name={`variants.${index}.quantity`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                  htmlFor={`variant-quantity-${index}`}
                                >
                                  Quantity
                                </FieldLabel>
                                <Input
                                  {...field}
                                  id={`variant-quantity-${index}`}
                                  aria-invalid={fieldState.invalid}
                                  inputMode="numeric"
                                  placeholder="0"
                                />
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <div className="flex items-end justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`Remove variant row ${index + 1}`}
                              disabled={fields.length === 1}
                              onClick={() => remove(index)}
                            >
                              <X />
                            </Button>
                          </div>
                        </FieldGroup>
                      ))}
                    </FieldGroup>

                    <div className="flex justify-start">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          append({
                            option: "size",
                            value: "",
                            price: "",
                            quantity: "",
                          })
                        }
                      >
                        <CirclePlus data-icon="inline-start" />
                        Add variant
                      </Button>
                    </div>
                  </FieldSet>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-dashed bg-muted/35 p-3 xl:self-start">
              <Card className="rounded-2xl border-border/80 bg-background/95 shadow-sm">
                <CardHeader>
                  <CardTitle>Pricing</CardTitle>
                  <CardDescription>
                    Set pricing, taxes, and live availability for this listing.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Controller
                      control={form.control}
                      name="basePrice"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="base-price">
                            Base price
                          </FieldLabel>
                          <InputGroup>
                            <InputGroupAddon align="inline-start">
                              <InputGroupText>
                                {selectedCurrency}
                              </InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput
                              {...field}
                              id="base-price"
                              aria-invalid={fieldState.invalid}
                              inputMode="decimal"
                              placeholder="45.00"
                            />
                          </InputGroup>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="discountedPrice"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="discounted-price">
                            Discounted price
                          </FieldLabel>
                          <InputGroup>
                            <InputGroupAddon align="inline-start">
                              <InputGroupText>
                                {selectedCurrency}
                              </InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput
                              {...field}
                              id="discounted-price"
                              aria-invalid={fieldState.invalid}
                              inputMode="decimal"
                              placeholder="39.00"
                            />
                          </InputGroup>
                          <FieldDescription>
                            Leave empty to sell at the base price.
                          </FieldDescription>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="currency"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="currency">Currency</FieldLabel>
                          <Select
                            value={field.value || undefined}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="currency"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="chargeTax"
                      render={({ field }) => (
                        <Field orientation="horizontal" className="items-start">
                          <Checkbox
                            id="charge-tax"
                            checked={field.value}
                            onCheckedChange={(checked) =>
                              field.onChange(Boolean(checked))
                            }
                          />
                          <FieldContent>
                            <FieldLabel htmlFor="charge-tax">
                              Charge tax on this product
                            </FieldLabel>
                            <FieldDescription>
                              Apply the default checkout tax rules
                              automatically.
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      )}
                    />

                    <Separator />

                    <Controller
                      control={form.control}
                      name="inStock"
                      render={({ field }) => (
                        <Field orientation="horizontal">
                          <Switch
                            id="in-stock"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <FieldContent>
                            <FieldLabel htmlFor="in-stock">In stock</FieldLabel>
                            <FieldDescription>
                              Turn this off to keep the product visible but
                              unavailable.
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border/80 bg-background/95 shadow-sm">
                <CardHeader>
                  <CardTitle>Status</CardTitle>
                  <CardDescription>
                    Choose when the new product should appear in the storefront.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Controller
                      control={form.control}
                      name="status"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="product-status">
                            Status
                          </FieldLabel>
                          <Select
                            value={field.value || undefined}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="product-status"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {statusOptions.map((status) => (
                                  <SelectItem
                                    key={status.value}
                                    value={status.value}
                                  >
                                    {status.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            Draft keeps the product private until your review is
                            done.
                          </FieldDescription>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border/80 bg-background/95 shadow-sm">
                <CardHeader>
                  <CardTitle>Organization</CardTitle>
                  <CardDescription>
                    Group the product so your catalog stays searchable and tidy.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Controller
                      control={form.control}
                      name="vendor"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="product-vendor">
                            Vendor
                          </FieldLabel>
                          <Input
                            {...field}
                            id="product-vendor"
                            aria-invalid={fieldState.invalid}
                            placeholder="eg. Nike"
                          />
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="category"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="product-category">
                            Category
                          </FieldLabel>
                          <Select
                            value={field.value || undefined}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="product-category"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {categoryOptions.map((category) => (
                                  <SelectItem
                                    key={category.value}
                                    value={category.value}
                                  >
                                    {category.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="subcategory"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="product-subcategory">
                            Sub category
                          </FieldLabel>
                          <Select
                            value={field.value || undefined}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="product-subcategory"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Select sub category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {subcategoryOptions.map((subcategory) => (
                                  <SelectItem
                                    key={subcategory.value}
                                    value={subcategory.value}
                                  >
                                    {subcategory.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="tags"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="product-tags">Tags</FieldLabel>
                          <Input
                            {...field}
                            id="product-tags"
                            aria-invalid={fieldState.invalid}
                            placeholder="hero launch, new arrival"
                          />
                          <FieldDescription>
                            Separate tags with commas to improve internal
                            discovery.
                          </FieldDescription>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </CardContent>
              </Card>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface EditProduct1Props {
  className?: string;
}

const EditProduct1 = ({ className }: EditProduct1Props) => {
  const initialValues: AddProductValues = {
    name: "Radiance Ritual Set",
    sku: "SKU-SKIN-4006",
    barcode: "0123456789001",
    description:
      "A bestselling ritual bundle with cleanser, serum, and moisturizer for daily glow maintenance.",
    vendor: "Acme Retail",
    basePrice: "389.00",
    discountedPrice: "349.00",
    currency: "USD",
    chargeTax: true,
    inStock: true,
    status: "active",
    category: "wellness",
    subcategory: "bundles",
    tags: "hero launch, bestseller, ritual set",
    variants: [
      {
        option: "bundle",
        value: "3-piece set",
        price: "389.00",
        quantity: "48",
      },
      { option: "size", value: "Travel trio", price: "179.00", quantity: "18" },
    ],
  };
  const assets: ProductEditorAssets = {
    thumbnail:
      "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
    gallery: [
      "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
      "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
      "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
    ],
  };

  return (
    <section className={cn("w-full bg-background", className)}>
      <EcommerceEditProduct initialValues={initialValues} assets={assets} />
    </section>
  );
};

export { EditProduct1 };
