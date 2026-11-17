import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const chapters = defineCollection({
loader: glob({
pattern: "**/*.md",
base: "./src/content/chapters"
}),

schema: z.object({
title: z.string(),
number: z.number(),
novel: z.string(),
updated: z.string().optional(),
volume: z.string().optional()
})
});

export const collections = { chapters };