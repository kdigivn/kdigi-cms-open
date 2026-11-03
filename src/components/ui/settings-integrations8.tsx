/* eslint-disable */
"use client";

import { ChevronRight, Circle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
interface IntegrationItem {
  image: string;
  title: string;
  description: string;
  isConnected?: boolean;
  category: string;
  className?: string;
}

interface SettingsIntegrations8Props {
  className?: string;
  heading?: string;
  subHeading?: string;
  integrations?: IntegrationItem[];
}

const SettingsIntegrations8 = ({
  className,
  heading = "Integrations",
  subHeading = "Browse and connect your favorite apps and services.",
  integrations = [
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/slack-icon.svg",
      title: "Slack",
      description: "Send notifications to Slack channels",
      isConnected: true,
      category: "Communication",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/discord-icon.svg",
      title: "Discord",
      description: "Post updates to Discord servers",
      category: "Communication",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/microsoft-teams-icon.svg",
      title: "Microsoft Teams",
      description: "Collaborate with your team",
      isConnected: true,
      category: "Communication",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/google-icon.svg",
      title: "Google Drive",
      description: "Store and sync files",
      isConnected: true,
      category: "Storage",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/dropbox-icon.svg",
      title: "Dropbox",
      description: "Cloud file storage",
      category: "Storage",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/microsoft-onedrive-icon.svg",
      title: "OneDrive",
      description: "Microsoft cloud storage",
      category: "Storage",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/github-icon.svg",
      title: "GitHub",
      description: "Code hosting and collaboration",
      isConnected: true,
      category: "Development",
      className: "dark:invert",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/gitlab-icon.svg",
      title: "GitLab",
      description: "DevOps platform",
      category: "Development",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/vercel-icon.svg",
      title: "Vercel",
      description: "Deploy web applications",
      category: "Development",
      className: "dark:invert",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/figma-icon.svg",
      title: "Figma",
      description: "Design collaboration",
      isConnected: true,
      category: "Design",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/notion-icon.svg",
      title: "Notion",
      description: "Notes and documentation",
      category: "Productivity",
      className: "dark:invert",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/linear-icon.svg",
      title: "Linear",
      description: "Issue tracking",
      isConnected: true,
      category: "Productivity",
      className: "dark:invert",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/jira-icon.svg",
      title: "Jira",
      description: "Project management",
      category: "Productivity",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/stripe-icon.svg",
      title: "Stripe",
      description: "Payment processing",
      isConnected: true,
      category: "Payments",
    },
  ],
}: SettingsIntegrations8Props) => {
  const [searchValue, setSearchValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    return [...new Set(integrations.map((i) => i.category))];
  }, [integrations]);

  const filteredIntegrations = useMemo(() => {
    return integrations.filter((integration) => {
      const matchesSearch =
        !searchValue ||
        integration.title.toLowerCase().includes(searchValue.toLowerCase()) ||
        integration.description
          .toLowerCase()
          .includes(searchValue.toLowerCase());
      const matchesCategory =
        !selectedCategory || integration.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [integrations, searchValue, selectedCategory]);

  const getCategoryCount = (category: string) => {
    return integrations.filter((i) => i.category === category).length;
  };

  return (
    <section className={cn("py-32", className)}>
      <div className="container max-w-6xl">
        <div className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
          <p className="text-muted-foreground">{subHeading}</p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Sidebar */}
          <div className="w-full shrink-0 lg:w-56">
            <div className="sticky top-8 space-y-4">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-9"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                    !selectedCategory && "bg-muted font-medium",
                  )}
                >
                  <span>All integrations</span>
                  <span className="text-muted-foreground">
                    {integrations.length}
                  </span>
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                      selectedCategory === category && "bg-muted font-medium",
                    )}
                  >
                    <span>{category}</span>
                    <span className="text-muted-foreground">
                      {getCategoryCount(category)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1">
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-2">
                {filteredIntegrations.map((integration) => (
                  <a
                    key={integration.title}
                    href="#"
                    className="group flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-background">
                      <img
                        src={integration.image}
                        alt={integration.title}
                        className={cn("size-7", integration.className)}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{integration.title}</span>
                        {integration.isConnected && (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800"
                          >
                            <Circle className="mr-1 size-2 fill-current" />
                            Connected
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {integration.description}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </section>
  );
};

export { SettingsIntegrations8 };
