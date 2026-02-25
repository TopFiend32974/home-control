const server = Bun.serve({
	port: 5050,
	routes: {
		"/": () => new Response('Bun!'),
	}
});

console.log(`Listening on ${server.url}`);
