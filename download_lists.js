import { existsSync } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

import {
  LIST_TYPE,
  PROCESSING_FILENAME,
  RECOMMENDED_ALLOWLIST_URLS,
  RECOMMENDED_BLOCKLIST_URLS,
  USER_DEFINED_ALLOWLIST_URLS,
  USER_DEFINED_BLOCKLIST_URLS,
} from "./lib/constants.js";
import { downloadFiles } from "./lib/utils.js";

const allowlistUrls = USER_DEFINED_ALLOWLIST_URLS || RECOMMENDED_ALLOWLIST_URLS;
const blocklistUrls = USER_DEFINED_BLOCKLIST_URLS || RECOMMENDED_BLOCKLIST_URLS;
const listType = process.argv[2];
const usePreviousListsOnDownloadFailure = !!parseInt(
  process.env.CGPS_USE_PREVIOUS_LISTS_ON_DOWNLOAD_FAILURE,
  10
);
const formatSource = (source) =>
  typeof source === "string" ? source : `${source.name}: ${source.url}`;
const getSourceWithFallback = (filename, source) => {
  if (typeof source === "string") return source;

  const fallbackDirectory = resolve(
    `./fallback-lists/${
      filename === PROCESSING_FILENAME.ALLOWLIST
        ? LIST_TYPE.ALLOWLIST
        : LIST_TYPE.BLOCKLIST
    }`
  );

  return {
    ...source,
    fallbackFilePath: join(fallbackDirectory, `${source.name}.txt`),
  };
};

const downloadLists = async (filename, urls) => {
  const filePath = resolve(`./${filename}`);
  const tempFilePath = resolve(`./${filename}.tmp`);

  if (existsSync(tempFilePath)) {
    await unlink(tempFilePath);
  }

  try {
    await downloadFiles(
      tempFilePath,
      urls.map((source) => getSourceWithFallback(filename, source))
    );
    await rename(tempFilePath, filePath);

    console.log(
      `Done. The ${filename} file contains merged data from the following list(s):`
    );
    console.log(
      urls.reduce(
        (previous, current, index) =>
          previous + `${index + 1}. ${formatSource(current)}\n`,
        ""
      )
    );
  } catch (err) {
    if (existsSync(tempFilePath)) {
      await unlink(tempFilePath);
    }

    if (usePreviousListsOnDownloadFailure && existsSync(filePath)) {
      console.warn(
        `Unable to refresh ${filename}. Reusing the previously downloaded file because CGPS_USE_PREVIOUS_LISTS_ON_DOWNLOAD_FAILURE=1.`
      );
      return;
    }

    console.error(`An error occurred while processing ${filename}:\n`, err);
    console.error("URLs:\n", urls);
    throw err;
  }
};

switch (listType) {
  case LIST_TYPE.ALLOWLIST: {
    await downloadLists(PROCESSING_FILENAME.ALLOWLIST, allowlistUrls);
    break;
  }
  case LIST_TYPE.BLOCKLIST: {
    await downloadLists(PROCESSING_FILENAME.BLOCKLIST, blocklistUrls);
    break;
  }
  default:
    await Promise.all([
      downloadLists(PROCESSING_FILENAME.ALLOWLIST, allowlistUrls),
      downloadLists(PROCESSING_FILENAME.BLOCKLIST, blocklistUrls),
    ]);
}
