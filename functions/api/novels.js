const FILE_PATH = "src/content/novels.json";

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
    // Check required server settings
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

    // Check admin password
    const password = request.headers.get("Authorization");

    if (password !== `Bearer ${env.ADMIN_PASSWORD}`) {
      return response({
        error: "Unauthorized."
      }, 401);
    }

    const data = await request.json();

    const title = String(data.title || "").trim();
    const slug = String(data.slug || "").trim();

    if (!title || !slug) {
      return response({
        error: "English title and slug are required."
      }, 400);
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return response({
        error: "Invalid novel slug."
      }, 400);
    }

    const allowedStatuses = [
      "Ongoing",
      "Completed",
      "Hiatus",
      "Coming Soon"
    ];

    const status = String(data.status || "Ongoing");

    if (!allowedStatuses.includes(status)) {
      return response({
        error: "Invalid translation status."
      }, 400);
    }

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || "main";

    const githubUrl =
      `https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}`;

    const headers = {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    // Retrieve the current novel library
    const fileResponse = await fetch(
      `${githubUrl}?ref=${branch}`,
      { headers }
    );

    if (!fileResponse.ok) {
      return response({
        error: "Could not retrieve the novel library from GitHub."
      }, 502);
    }

    const fileData = await fileResponse.json();

    const binary = atob(fileData.content.replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));

    const currentContent = new TextDecoder().decode(bytes);
    const library = JSON.parse(currentContent);

    if (!Array.isArray(library.novels)) {
      return response({
        error: "The novel library has an invalid format."
      }, 500);
    }

    // Prevent duplicate novels
    if (library.novels.some(novel => novel.slug === slug)) {
      return response({
        error: "A novel with this slug already exists."
      }, 409);
    }

    // Create the new novel
    const novel = {
      slug,
      title,
      rawTitle: String(data.rawTitle || "").trim(),
      author: String(data.author || "Unknown Author").trim(),
      cover: String(data.cover || "").trim(),
      synopsis: String(data.synopsis || "").trim(),
      genres: String(data.genres || "")
        .split(",")
        .map(genre => genre.trim())
        .filter(Boolean),
      status,
      totalChapters: Math.max(
        0,
        Number(data.totalChapters) || 0
      ),
      novelUpdates: String(data.novelUpdates || "").trim(),
      patreon: String(data.patreon || "").trim(),
      chapters: []
    };

    library.novels.push(novel);

    const updatedContent = JSON.stringify(library, null, 2);

    // Save the updated library to GitHub
    const saveResponse = await fetch(githubUrl, {
      method: "PUT",

      headers: {
        ...headers,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: `Add novel: ${title}`,
        content: encodeBase64(updatedContent),
        sha: fileData.sha,
        branch
      })
    });

    if (!saveResponse.ok) {
      return response({
        error: "GitHub could not save the novel."
      }, 502);
    }

    return response({
      success: true,
      message: "Novel saved successfully.",
      novel
    });

  } catch (error) {
    return response({
      error: "An unexpected server error occurred."
    }, 500);
  }
}