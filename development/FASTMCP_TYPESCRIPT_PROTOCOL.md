THE FOLLOWING ARE INSTRUCTIONS FOR YOU TO COMPLY AND FOLLOW WHEN BUILDING AN MCP SERVER WITH FASTMCP TYPESCRIPT

1. Introduction to the Model Context Protocol (MCP)The Model Context Protocol (MCP) is an open standard designed to standardize how applications provide context, data, and tools to Large Language Models (LLMs). It functions like a universal adapter (akin to USB-C), enabling AI applications to seamlessly connect with a diverse range of local and remote data sources and tools.Key Benefits of MCP:Interoperability: A growing ecosystem of pre-built servers allows for plug-and-play integrations.Flexibility: Easily switch between different LLM providers and vendors without rebuilding integrations.Security: Provides best practices for securing data within your own infrastructure.Core Architecture:MCP operates on a client-server model:Host: An application (e.g., Claude Desktop, an IDE) that runs and manages MCP clients.MCP Client: A protocol client living within the Host that maintains a 1:1 connection with an MCP server.MCP Server: A lightweight program that exposes specific capabilities (data, tools) to a client through the standardized protocol.Data Sources: Can be local files and services or remote APIs that the server provides access to.graph LR
    subgraph "Your Computer"
        Host["Host Application (IDE, etc.)"] -- Manages --> Client1["MCP Client 1"]
        Host -- Manages --> Client2["MCP Client 2"]
        Client1 <-->|MCP over stdio| Server1["MCP Server A (Local Files)"]
        Client2 <-->|MCP over stdio| Server2["MCP Server B (Database)"]
        Server1 <--> D1[("Local Data Source A")]
        Server2 <--> D2[("Local Data Source B")]
    end
    subgraph "Internet"
         Client3["MCP Client 3"]
         Host -- Manages --> Client3
         Client3 <-->|MCP over HTTP/SSE| Server3["MCP Server C (Web API)"]
         Server3 <--> D3[("Remote Service C")]
    end
2. Core Server PrimitivesMCP servers expose their capabilities through three main primitives, each with a distinct control model:PrimitiveControl ModelDescriptionUse Case ExampleResourcesApplication-controlledExposes data and content that the client application decides how and when to use.Reading file contents, accessing database records.ToolsModel-controlledExposes executable functions that the LLM can decide to call (with user approval).Running shell commands, creating a GitHub issue, writing to a file.PromptsUser-controlledPre-defined, reusable templates or workflows that the end-user explicitly invokes.A "/git-commit" slash command in a chat interface.a. ResourcesResources allow a server to expose data (text or binary) identified by a unique URI.Discovery: Clients discover resources via the resources/list request and dynamic URI templates from resources/templates/list.Reading: Clients read content using the resources/read request.Updates: Servers can notify clients of changes to the resource list (notifications/resources/list_changed) or to a specific resource's content if the client is subscribed (notifications/resources/updated).b. ToolsTools allow an LLM to perform actions by invoking functions the server exposes.Definition: Each tool has a name, description, and a JSON Schema defining its input parameters. Annotations can provide hints about behavior (e.g., readOnlyHint, destructiveHint).Discovery: Clients list available tools via the tools/list request.Invocation: The LLM requests a tool call, and the client sends a tools/call request to the server. The server executes the logic and returns the result.Error Handling: Tool execution errors are reported inside the result object (isError: true), allowing the LLM to see and react to the failure.c. PromptsPrompts are reusable templates for common LLM interactions, often surfaced as UI elements like slash commands.Structure: A prompt has a name, description, and a list of arguments.Discovery: Clients use prompts/list to find available prompts.Usage: A client sends a prompts/get request with the prompt name and arguments, and the server returns the fully formed message(s) for the LLM.3. Protocol, Lifecycle, and TransportsMCP is built on a robust technical foundation that ensures reliable communication.a. Messaging FormatAll communication uses JSON-RPC 2.0, which defines three message types:Requests: Initiate an operation and require a response. Must have an id and method.Responses: The reply to a request, containing either a result or an error. Must have the same id as the request.Notifications: One-way messages that do not expect a response. Must not have an id.b. Connection LifecycleA connection follows a strict lifecycle:Initialization: The client sends an initialize request with its capabilities and supported protocol version. The server responds with its own capabilities. This is a mandatory negotiation.Ready: The client sends an initialized notification, and normal operations can begin.Operation: The client and server exchange messages based on the negotiated capabilities.Shutdown: The connection is terminated, typically by closing the underlying transport.c. Transport MechanismsMCP defines two standard communication transports:stdio (Standard Input/Output): Ideal for local servers. The host application launches the server as a subprocess and communicates over stdin and stdout. This is the most common and recommended transport for local development.Streamable HTTP: For remote or network-accessible servers. This transport uses HTTP POST for client-to-server messages and can use Server-Sent Events (SSE) for streaming server-to-client messages. It includes session management and provisions for resumable connections.d. Authorization (for HTTP)For servers using the HTTP transport, MCP specifies an OAuth 2.1-based authorization framework.It supports dynamic client registration and server metadata discovery.It protects against attacks like DNS rebinding by requiring origin validation.For stdio transport, servers should retrieve credentials from the environment instead.4. Getting Started with Server DevelopmentDevelopers can build MCP servers using two main approaches:Low-Level SDKs: Official SDKs (e.g., for Python, TypeScript) provide direct access to the protocol's features, offering maximum control and flexibility.High-Level Frameworks: Frameworks like FastMCP for TypeScript abstract away much of the boilerplate, enabling rapid development with a simpler, more intuitive API.a. High-Level Framework: FastMCP for TypeScriptFastMCP is a TypeScript framework that simplifies building MCP servers. It handles sessions, transport, and protocol details, allowing you to focus on defining your server's capabilities.Quickstart with FastMCP:import { FastMCP } from "fastmcp";
import { z } from "zod"; // FastMCP supports any standard schema library

const server = new FastMCP({
  name: "My Server",
  version: "1.0.0",
});

server.addTool({
  name: "add",
  description: "Add two numbers",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async (args) => {
    return String(args.a + args.b);
  },
});

server.start({
  transportType: "stdio",
});
Key Features of FastMCP:Simple Tool Definition: Define tools with schema validation using libraries like Zod, ArkType, or Valibot. The execute function can return various content types (string, image, audio, or a list of content objects).Contextual Features:Logging: Use log.info(), log.warn(), etc., inside a tool's execute function to send logs to the client.Progress: Report progress for long-running operations with reportProgress({ progress, total }).Errors: Throw a UserError to send user-facing error messages back to the client.Resources & Prompts: Easily define resources, resource templates, and prompts with auto-completion for arguments.Session Management: FastMCP manages client sessions, allowing you to access session data (context.session) and listen for typed events like connect and disconnect.Authentication: Implement custom authentication functions to secure your server.LLM Sampling: Servers can request completions from the client's LLM using session.requestSampling().b. Low-Level SDK: Building with the Python SDKHere is the skeleton of the "weather" server from the official quickstart, demonstrating the use of a lower-level SDK.# 1. Import necessary packages
from typing import Any
import httpx
from mcp.server.fastmcp import FastMCP # Note: This refers to the official SDK's FastMCP

# 2. Initialize the server
mcp = FastMCP("weather-server")

# 3. Define a tool using decorators
@mcp.tool()
async def get_forecast(latitude: float, longitude: float) -> str:
    """
    Get the weather forecast for a specific location.

    Args:
        latitude: The latitude of the location.
        longitude: The longitude of the location.
    """
    # ... implementation to call a weather API ...
    api_url = f"https://api.weather.gov/points/{latitude},{longitude}"
    # ... process response and return a formatted string ...
    return "The forecast is..."

# 4. Add the main entry point to run the server
if __name__ == "__main__":
    mcp.run(transport='stdio')
5. Testing and Debugging Your ServerMCP Inspector: An interactive command-line tool (npx @modelcontextprotocol/inspector <command>) for connecting to and testing your server's capabilities (resources, tools, prompts) in isolation. This is the recommended first step for debugging.FastMCP CLI: The FastMCP framework includes its own CLI for development.npx fastmcp dev server.ts: Run the server with an interactive CLI for testing.npx fastmcp inspect server.ts: Run the server with the official MCP Inspector Web UI.Claude for Desktop Logs: When integrating with Claude Desktop, you can find detailed MCP logs in ~/Library/Logs/Claude/ (macOS) or %APPDATA%\Claude\logs\ (Windows). Look for mcp.log and mcp-server-YOUR_SERVER_NAME.log.Configuration: To connect a local server to Claude for Desktop, you must edit claude_desktop_config.json to specify the command and arguments needed to launch your server. Always use absolute paths.6. Community and Further ResourcesExample Servers: The official MCP Servers Repository contains numerous reference implementations for common tools like Git, GitHub, Filesystem, Slack, and more.Example Clients: The documentation lists a wide array of clients that have integrated MCP, from IDEs to AI agents.Contributing: The MCP project welcomes community contributions. Check the contributing guidelines and join the discussions on GitHub.

FastMCP
A TypeScript framework for building MCP servers capable of handling client sessions.

Note

For a Python implementation, see FastMCP.

Features
Simple Tool, Resource, Prompt definition
Authentication
Sessions
Image content
Audio content
Logging
Error handling
SSE
CORS (enabled by default)
Progress notifications
Typed server events
Prompt argument auto-completion
Sampling
Automated SSE pings
Roots
CLI for testing and debugging
Installation
npm install fastmcp
Quickstart
Note

There are many real-world examples of using FastMCP in the wild. See the Showcase for examples.

import { FastMCP } from "fastmcp";
import { z } from "zod"; // Or any validation library that supports Standard Schema

const server = new FastMCP({
  name: "My Server",
  version: "1.0.0",
});

server.addTool({
  name: "add",
  description: "Add two numbers",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async (args) => {
    return String(args.a + args.b);
  },
});

server.start({
  transportType: "stdio",
});
That's it! You have a working MCP server.

You can test the server in terminal with:

git clone https://github.com/punkpeye/fastmcp.git
cd fastmcp

pnpm install
pnpm build

# Test the addition server example using CLI:
npx fastmcp dev src/examples/addition.ts
# Test the addition server example using MCP Inspector:
npx fastmcp inspect src/examples/addition.ts
SSE
Server-Sent Events (SSE) provide a mechanism for servers to send real-time updates to clients over an HTTPS connection. In the context of MCP, SSE is primarily used to enable remote MCP communication, allowing an MCP hosted on a remote machine to be accessed and relay updates over the network.

You can also run the server with SSE support:

server.start({
  transportType: "sse",
  sse: {
    endpoint: "/sse",
    port: 8080,
  },
});
This will start the server and listen for SSE connections on http://localhost:8080/sse.

You can then use SSEClientTransport to connect to the server:

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const client = new Client(
  {
    name: "example-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  },
);

const transport = new SSEClientTransport(new URL(`http://localhost:8080/sse`));

await client.connect(transport);
Core Concepts
Tools
Tools in MCP allow servers to expose executable functions that can be invoked by clients and used by LLMs to perform actions.

FastMCP uses the Standard Schema specification for defining tool parameters. This allows you to use your preferred schema validation library (like Zod, ArkType, or Valibot) as long as it implements the spec.

Zod Example:

import { z } from "zod";

server.addTool({
  name: "fetch-zod",
  description: "Fetch the content of a url (using Zod)",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return await fetchWebpageContent(args.url);
  },
});
ArkType Example:

import { type } from "arktype";

server.addTool({
  name: "fetch-arktype",
  description: "Fetch the content of a url (using ArkType)",
  parameters: type({
    url: "string",
  }),
  execute: async (args) => {
    return await fetchWebpageContent(args.url);
  },
});
Valibot Example:

Valibot requires the peer dependency @valibot/to-json-schema.

import * as v from "valibot";

server.addTool({
  name: "fetch-valibot",
  description: "Fetch the content of a url (using Valibot)",
  parameters: v.object({
    url: v.string(),
  }),
  execute: async (args) => {
    return await fetchWebpageContent(args.url);
  },
});
Returning a string
execute can return a string:

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return "Hello, world!";
  },
});
The latter is equivalent to:

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return {
      content: [
        {
          type: "text",
          text: "Hello, world!",
        },
      ],
    };
  },
});
Returning a list
If you want to return a list of messages, you can return an object with a content property:

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return {
      content: [
        { type: "text", text: "First message" },
        { type: "text", text: "Second message" },
      ],
    };
  },
});
Returning an image
Use the imageContent to create a content object for an image:

import { imageContent } from "fastmcp";

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return imageContent({
      url: "https://example.com/image.png",
    });

    // or...
    // return imageContent({
    //   path: "/path/to/image.png",
    // });

    // or...
    // return imageContent({
    //   buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
    // });

    // or...
    // return {
    //   content: [
    //     await imageContent(...)
    //   ],
    // };
  },
});
The imageContent function takes the following options:

url: The URL of the image.
path: The path to the image file.
buffer: The image data as a buffer.
Only one of url, path, or buffer must be specified.

The above example is equivalent to:

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return {
      content: [
        {
          type: "image",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          mimeType: "image/png",
        },
      ],
    };
  },
});
Returning an audio
Use the audioContent to create a content object for an audio:

import { audioContent } from "fastmcp";

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return audioContent({
      url: "https://example.com/audio.mp3",
    });

    // or...
    // return audioContent({
    //   path: "/path/to/audio.mp3",
    // });

    // or...
    // return audioContent({
    //   buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
    // });

    // or...
    // return {
    //   content: [
    //     await audioContent(...)
    //   ],
    // };
  },
});
The audioContent function takes the following options:

url: The URL of the audio.
path: The path to the audio file.
buffer: The audio data as a buffer.
Only one of url, path, or buffer must be specified.

The above example is equivalent to:

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return {
      content: [
        {
          type: "audio",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          mimeType: "audio/mpeg",
        },
      ],
    };
  },
});
Return combination type
You can combine various types in this way and send them back to AI

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    return {
      content: [
        {
          type: "text",
          text: "Hello, world!",
        },
        {
          type: "image",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          mimeType: "image/png",
        },
        {
          type: "audio",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          mimeType: "audio/mpeg",
        },
      ],
    };
  },

  // or...
  // execute: async (args) => {
  //   const imgContent = imageContent({
  //     url: "https://example.com/image.png",
  //   });
  //   const audContent = audioContent({
  //     url: "https://example.com/audio.mp3",
  //   });
  //   return {
  //     content: [
  //       {
  //         type: "text",
  //         text: "Hello, world!",
  //       },
  //       imgContent,
  //       audContent,
  //     ],
  //   };
  // },
});
Logging
Tools can log messages to the client using the log object in the context object:

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args, { log }) => {
    log.info("Downloading file...", {
      url,
    });

    // ...

    log.info("Downloaded file");

    return "done";
  },
});
The log object has the following methods:

debug(message: string, data?: SerializableValue)
error(message: string, data?: SerializableValue)
info(message: string, data?: SerializableValue)
warn(message: string, data?: SerializableValue)
Errors
The errors that are meant to be shown to the user should be thrown as UserError instances:

import { UserError } from "fastmcp";

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args) => {
    if (args.url.startsWith("https://example.com")) {
      throw new UserError("This URL is not allowed");
    }

    return "done";
  },
});
Progress
Tools can report progress by calling reportProgress in the context object:

server.addTool({
  name: "download",
  description: "Download a file",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async (args, { reportProgress }) => {
    reportProgress({
      progress: 0,
      total: 100,
    });

    // ...

    reportProgress({
      progress: 100,
      total: 100,
    });

    return "done";
  },
});
Tool Annotations
As of the MCP Specification (2025-03-26), tools can include annotations that provide richer context and control by adding metadata about a tool's behavior:

server.addTool({
  name: "fetch-content",
  description: "Fetch content from a URL",
  parameters: z.object({
    url: z.string(),
  }),
  annotations: {
    title: "Web Content Fetcher", // Human-readable title for UI display
    readOnlyHint: true, // Tool doesn't modify its environment
    openWorldHint: true, // Tool interacts with external entities
  },
  execute: async (args) => {
    return await fetchWebpageContent(args.url);
  },
});
The available annotations are:

Annotation	Type	Default	Description
title	string	-	A human-readable title for the tool, useful for UI display
readOnlyHint	boolean	false	If true, indicates the tool does not modify its environment
destructiveHint	boolean	true	If true, the tool may perform destructive updates (only meaningful when readOnlyHint is false)
idempotentHint	boolean	false	If true, calling the tool repeatedly with the same arguments has no additional effect (only meaningful when readOnlyHint is false)
openWorldHint	boolean	true	If true, the tool may interact with an "open world" of external entities
These annotations help clients and LLMs better understand how to use the tools and what to expect when calling them.

Resources
Resources represent any kind of data that an MCP server wants to make available to clients. This can include:

File contents
Screenshots and images
Log files
And more
Each resource is identified by a unique URI and can contain either text or binary data.

server.addResource({
  uri: "file:///logs/app.log",
  name: "Application Logs",
  mimeType: "text/plain",
  async load() {
    return {
      text: await readLogFile(),
    };
  },
});
Note

load can return multiple resources. This could be used, for example, to return a list of files inside a directory when the directory is read.

async load() {
  return [
    {
      text: "First file content",
    },
    {
      text: "Second file content",
    },
  ];
}
You can also return binary contents in load:

async load() {
  return {
    blob: 'base64-encoded-data'
  };
}
Resource templates
You can also define resource templates:

server.addResourceTemplate({
  uriTemplate: "file:///logs/{name}.log",
  name: "Application Logs",
  mimeType: "text/plain",
  arguments: [
    {
      name: "name",
      description: "Name of the log",
      required: true,
    },
  ],
  async load({ name }) {
    return {
      text: `Example log content for ${name}`,
    };
  },
});
Resource template argument auto-completion
Provide complete functions for resource template arguments to enable automatic completion:

server.addResourceTemplate({
  uriTemplate: "file:///logs/{name}.log",
  name: "Application Logs",
  mimeType: "text/plain",
  arguments: [
    {
      name: "name",
      description: "Name of the log",
      required: true,
      complete: async (value) => {
        if (value === "Example") {
          return {
            values: ["Example Log"],
          };
        }

        return {
          values: [],
        };
      },
    },
  ],
  async load({ name }) {
    return {
      text: `Example log content for ${name}`,
    };
  },
});
Prompts
Prompts enable servers to define reusable prompt templates and workflows that clients can easily surface to users and LLMs. They provide a powerful way to standardize and share common LLM interactions.

server.addPrompt({
  name: "git-commit",
  description: "Generate a Git commit message",
  arguments: [
    {
      name: "changes",
      description: "Git diff or description of changes",
      required: true,
    },
  ],
  load: async (args) => {
    return `Generate a concise but descriptive commit message for these changes:\n\n${args.changes}`;
  },
});
Prompt argument auto-completion
Prompts can provide auto-completion for their arguments:

server.addPrompt({
  name: "countryPoem",
  description: "Writes a poem about a country",
  load: async ({ name }) => {
    return `Hello, ${name}!`;
  },
  arguments: [
    {
      name: "name",
      description: "Name of the country",
      required: true,
      complete: async (value) => {
        if (value === "Germ") {
          return {
            values: ["Germany"],
          };
        }

        return {
          values: [],
        };
      },
    },
  ],
});
Prompt argument auto-completion using enum
If you provide an enum array for an argument, the server will automatically provide completions for the argument.

server.addPrompt({
  name: "countryPoem",
  description: "Writes a poem about a country",
  load: async ({ name }) => {
    return `Hello, ${name}!`;
  },
  arguments: [
    {
      name: "name",
      description: "Name of the country",
      required: true,
      enum: ["Germany", "France", "Italy"],
    },
  ],
});
Authentication
FastMCP allows you to authenticate clients using a custom function:

import { AuthError } from "fastmcp";

const server = new FastMCP({
  name: "My Server",
  version: "1.0.0",
  authenticate: ({ request }) => {
    const apiKey = request.headers["x-api-key"];

    if (apiKey !== "123") {
      throw new Response(null, {
        status: 401,
        statusText: "Unauthorized",
      });
    }

    // Whatever you return here will be accessible in the `context.session` object.
    return {
      id: 1,
    };
  },
});
Now you can access the authenticated session data in your tools:

server.addTool({
  name: "sayHello",
  execute: async (args, { session }) => {
    return `Hello, ${session.id}!`;
  },
});
Providing Instructions
You can provide instructions to the server using the instructions option:

const server = new FastMCP({
  name: "My Server",
  version: "1.0.0",
  instructions:
    'Instructions describing how to use the server and its features.\n\nThis can be used by clients to improve the LLM\'s understanding of available tools, resources, etc. It can be thought of like a "hint" to the model. For example, this information MAY be added to the system prompt.',
});
Sessions
The session object is an instance of FastMCPSession and it describes active client sessions.

server.sessions;
We allocate a new server instance for each client connection to enable 1:1 communication between a client and the server.

Typed server events
You can listen to events emitted by the server using the on method:

server.on("connect", (event) => {
  console.log("Client connected:", event.session);
});

server.on("disconnect", (event) => {
  console.log("Client disconnected:", event.session);
});
FastMCPSession
FastMCPSession represents a client session and provides methods to interact with the client.

Refer to Sessions for examples of how to obtain a FastMCPSession instance.

requestSampling
requestSampling creates a sampling request and returns the response.

await session.requestSampling({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: "What files are in the current directory?",
      },
    },
  ],
  systemPrompt: "You are a helpful file system assistant.",
  includeContext: "thisServer",
  maxTokens: 100,
});
clientCapabilities
The clientCapabilities property contains the client capabilities.

session.clientCapabilities;
loggingLevel
The loggingLevel property describes the logging level as set by the client.

session.loggingLevel;
roots
The roots property contains the roots as set by the client.

session.roots;
server
The server property contains an instance of MCP server that is associated with the session.

session.server;
Typed session events
You can listen to events emitted by the session using the on method:

session.on("rootsChanged", (event) => {
  console.log("Roots changed:", event.roots);
});

session.on("error", (event) => {
  console.error("Error:", event.error);
});
Running Your Server
Test with mcp-cli
The fastest way to test and debug your server is with fastmcp dev:

npx fastmcp dev server.js
npx fastmcp dev server.ts
This will run your server with mcp-cli for testing and debugging your MCP server in the terminal.

Inspect with MCP Inspector
Another way is to use the official MCP Inspector to inspect your server with a Web UI:

npx fastmcp inspect server.ts
FAQ
How to use with Claude Desktop?
Follow the guide https://modelcontextprotocol.io/quickstart/user and add the following configuration:

{
  "mcpServers": {
    "my-mcp-server": {
      "command": "npx",
      "args": ["tsx", "/PATH/TO/YOUR_PROJECT/src/index.ts"],
      "env": {
        "YOUR_ENV_VAR": "value"
      }
    }
  }
}

THE ABOVE ARE INSTRUCTIONS FOR YOU TO COMPLY AND FOLLOW WHEN BUILDING AN MCP SERVER WITH FASTMCP TYPESCRIPT