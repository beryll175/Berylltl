function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function onRequestPost({ request, env }) {
  try {
    if (
      !env.GITHUB_TOKEN ||
      !env.GITHUB_OWNER ||
      !env.GITHUB_REPO ||
      !env.ADMIN_PASSWORD
    ) {
      return response({
        error: "Server configuration is incomplete."
      }, 500);
    }

    const password = request.headers.get("Authorization");

    if (password !== `Bearer ${env.ADMIN_PASSWORD}`) {
      return response({
        error: "Unauthorized."
      }, 401);
    }

    const data = await request.json();

    const chapterId = String(data.chapterId || "").trim();
    const title = String(data.title || "").trim();
    const number = Number(data.number);
    const updated = String(data.updated || "").trim();
    const volume = String(data.volume || "").trim();
    const content = String(data.content || "");

    if (
      !chapterId ||
      !title ||
      !Number.isInteger(number) ||
      number < 1
    ) {
      return response({
        error: "Chapter identifier, title and valid number are required."
      }, 400);
    }

    // Validate the actual Markdown file identifier.
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(chapterId) ||
      chapterId.includes("..")
    ) {
      return response({
        error: "Invalid chapter file identifier."
      }, 400);
    }

    const novelSlug = chapterId.split("/")[0];

    const filePath =
      `src/content/chapters/${chapterId.replace(/\.md$/, "")}.md`;

    const safeContent = content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "");

    const markdown = [
      "---",
      `title: ${JSON.stringify(title)}`,
      `number: ${number}`,
      `novel: ${JSON.stringify(novelSlug)}`,
      `updated: ${JSON.stringify(updated)}`,
      `volume: ${JSON.stringify(volume)}`,
      "---",
      "",
      safeContent
    ].join("\n");

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || "main";

    const encodedPath = filePath
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const githubUrl =
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

    const headers = {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    // Retrieve the existing chapter to obtain its SHA.
    const fileResponse = await fetch(
      `${githubUrl}?ref=${encodeURIComponent(branch)}`,
      { headers }
    );

    if (!fileResponse.ok) {
      return response({
        error: "Could not find the existing chapter on GitHub."
      }, 404);
    }

    const fileData = await fileResponse.json();

    // Update the existing Markdown file.
    const saveResponse = await fetch(githubUrl, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Update ${novelSlug} chapter ${number}: ${title}`,
        content: encodeBase64(markdown),
        sha: fileData.sha,
        branch
      })
    });

    if (!saveResponse.ok) {
      return response({
        error: "GitHub could not save the chapter."
      }, 502);
    }

    return response({
      success: true,
      message: "Chapter updated successfully."
    });

  } catch (error) {
    return response({
      error: "An unexpected server error occurred."
    }, 500);
  }
}