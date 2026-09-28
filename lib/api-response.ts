export async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    const body = await response.text();
    const cloudflareResourceError =
      response.status === 1102 ||
      /worker exceeded resource limits|error\s+1102/i.test(body);

    if (cloudflareResourceError) {
      throw new Error(
        "O servidor atingiu o limite de CPU da Cloudflare. Aguarde alguns segundos e tente novamente.",
      );
    }

    throw new Error(
      response.ok
        ? "O servidor retornou uma resposta inválida."
        : `O servidor está indisponível (erro ${response.status}).`,
    );
  }

  const data = (await response.json()) as T & { error?: unknown };
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `A solicitação falhou (erro ${response.status}).`,
    );
  }
  return data;
}
