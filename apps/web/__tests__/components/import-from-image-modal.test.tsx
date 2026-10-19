import type { ReactNode } from "react";
import ImportFromImageModal from "@/components/shared/import-from-image-modal";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recipesMock = vi.hoisted(() => ({
  importRecipeFromImages: vi.fn(),
}));

const userSettingsMock = vi.hoisted(() => ({
  user: { preferences: {} as Record<string, unknown> } as {
    preferences: Record<string, unknown>;
  } | null,
  isLoading: false,
}));

vi.mock("next-intl", () => {
  const messages = {
    title: "One recipe from photos",
    description: "The photos are combined into one recipe.",
    bulkPrompt: "Several recipes?",
    bulkLink: "Use Bulk images — one recipe per image",
    importWithAI: "importWithAI",
  } as Record<string, string>;

  return { useTranslations: () => (key: string) => messages[key] ?? key };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img alt={alt} src={src} />,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <a
      className={className}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/config", () => ({
  useUploadLimitsQuery: () => ({ limits: { maxImageSize: 10 * 1024 * 1024 } }),
}));

vi.mock("@/hooks/recipes", () => ({
  useRecipesMutations: () => recipesMock,
}));

vi.mock("@/hooks/use-clipboard-image-paste", () => ({
  useClipboardImagePaste: vi.fn(),
}));

vi.mock("@/hooks/user/use-user-query", () => ({
  useUserSettingsQuery: () => userSettingsMock,
}));

vi.mock("@/lib/ui/safe-error-toast", () => ({
  showSafeErrorToast: vi.fn(),
}));

vi.mock("@/components/shared/auto-enrich-toggle", async () => {
  const actual = await vi.importActual<typeof import("@/components/shared/auto-enrich-toggle")>(
    "@/components/shared/auto-enrich-toggle"
  );

  return {
    ...actual,
    default: ({
      isSelected,
      onValueChange,
    }: {
      isSelected: boolean | undefined;
      onValueChange: (isSelected: boolean) => void;
    }) => (
      <button aria-pressed={isSelected} type="button" onClick={() => onValueChange(!isSelected)}>
        auto-enrich
      </button>
    ),
  };
});

vi.mock("@heroicons/react/16/solid", () => ({
  PhotoIcon: () => <span />,
  SparklesIcon: () => <span />,
  XMarkIcon: () => <span />,
}));

vi.mock("@/components/ui/drop-zone", () => {
  const Root = ({ children }: { children: ReactNode }) => <div>{children}</div>;

  return {
    DropZone: Object.assign(Root, {
      Area: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Icon: ({ children }: { children: ReactNode }) => <span>{children}</span>,
      Label: ({ children }: { children: ReactNode }) => <span>{children}</span>,
      Description: ({ children }: { children: ReactNode }) => <span>{children}</span>,
      Trigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
      Input: ({ onSelect }: { onSelect?: (files: File[]) => void }) => (
        <input
          aria-label="image-input"
          type="file"
          onChange={(event) => onSelect?.(Array.from(event.target.files ?? []))}
        />
      ),
    }),
  };
});

vi.mock("@heroui/react", () => ({
  Modal: Object.assign(({ children }: { children: ReactNode }) => <>{children}</>, {
    Backdrop: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
      isOpen ? <div>{children}</div> : null,
    Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Dialog: ({ children }: { children: (() => ReactNode) | ReactNode }) =>
      typeof children === "function" ? <div>{children()}</div> : <div>{children}</div>,
    CloseTrigger: () => <button aria-label="Close" type="button" />,
    Header: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Body: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Footer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  }),
  Button: ({
    children,
    isDisabled,
    onPress,
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onPress}>
      {children}
    </button>
  ),
  Kbd: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  toast: vi.fn(),
}));

const image = () => new File(["image"], "page.jpg", { type: "image/jpeg" });

describe("ImportFromImageModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userSettingsMock.user = { preferences: {} };
    userSettingsMock.isLoading = false;
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the bulk entry and closes when it is followed", () => {
    const onOpenChange = vi.fn();

    render(<ImportFromImageModal isOpen onOpenChange={onOpenChange} />);

    expect(screen.getByText("One recipe from photos")).toBeInTheDocument();
    expect(screen.getByText("The photos are combined into one recipe.")).toBeInTheDocument();
    expect(screen.getByText("Several recipes?")).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: "Use Bulk images — one recipe per image",
    });

    expect(link).toHaveAttribute("href", "/recipes/import");

    fireEvent.click(link);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("passes the per-add auto-enrich choice with the images", async () => {
    render(<ImportFromImageModal isOpen onOpenChange={vi.fn()} />);

    const file = image();

    fireEvent.change(screen.getByLabelText("image-input"), { target: { files: [file] } });

    const toggle = screen.getByRole("button", { name: "auto-enrich" });

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "importWithAI" }));

    await waitFor(() => {
      expect(recipesMock.importRecipeFromImages).toHaveBeenCalledWith([file], {
        autoEnrich: false,
      });
    });
  });

  it("starts off when the profile turned automatic AI off", () => {
    userSettingsMock.user = { preferences: { autoEnrichOnAdd: false } };

    render(<ImportFromImageModal isOpen onOpenChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "auto-enrich" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
