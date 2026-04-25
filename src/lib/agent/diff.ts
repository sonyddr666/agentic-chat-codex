import { createTwoFilesPatch } from "diff";

export function createUnifiedDiff(filePath: string, beforeContent: string, afterContent: string) {
  if (beforeContent === afterContent) {
    return "";
  }

  return createTwoFilesPatch(filePath, filePath, beforeContent, afterContent, "before", "after", {
    context: 3
  });
}

