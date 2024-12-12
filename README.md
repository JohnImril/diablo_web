# Diablo Web

![App Screenshot](./public/screenshot.png)

**Diablo Web** is a web-based port of the classic Diablo game, bringing the original atmosphere directly into your browser. The goal is to recreate the authentic Diablo experience using modern tools and technologies such as Vite and TypeScript.

## Online Demo

A live demo of the project is available at: [https://johnimril.github.io/diablo_web/](https://johnimril.github.io/diablo_web/).

To run the shareware version locally, place the `spawn.mpq` file (from the free shareware edition) into the `public` folder. This allows you to play the demo version of Diablo in your browser, even on mobile devices.

For the full game experience, you’ll need your own `DIABDAT.MPQ` file obtained from a legitimate copy of the game, such as the one available on [GOG](https://www.gog.com/game/diablo). Simply place it in the appropriate directory before launching, and you’ll be able to enjoy the complete version directly in your browser.

## About the Project

This project started as a fork of [DiabloWeb](https://github.com/d07RiV/diabloweb) by d07RiV. After encountering compatibility issues with Node.js 22, I fixed and updated the original code, resulting in a working fork that you can find [here](https://github.com/JohnImril/diabloweb-beta).

Following the successful update, I decided to rebuild the project from the ground up using Vite and TypeScript, which led to the creation of **Diablo Web**.

The project also relies on the work done by the [devilution](https://github.com/diasurgical/devilution) community. Their efforts made it possible to run Diablo 1 in a browser via WebAssembly. The source code used to build the WebAssembly modules can be found [here](https://github.com/d07RiV/devilution).

During the development process, I removed unnecessary dependencies and streamlined the interface to enable successful compilation into WebAssembly. Significant changes were made to event handling—especially in the menus—to ensure seamless integration into the JavaScript environment.

## Key Features

- **Vite Integration**: Enjoy faster development and a simplified configuration process.
- **TypeScript Support**: Benefit from static typing for better maintainability and fewer errors.
- **Modernized Codebase**: Updated dependencies and improved performance and reliability.
- **Node.js 22 Compatibility**: Issues preventing the project from running on modern Node versions have been resolved.
- **Shareware and Full Game Support**: Quickly launch the demo version or load your full game files for the complete Diablo experience in the browser.

## Getting Started

### Prerequisites

- Node.js (v22 or later)
- npm (or your preferred package manager)

### Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/JohnImril/diablo_web.git
    ```

2. Move into the project directory:

    ```bash
    cd diablo_web
    ```

3. Install the dependencies:

    ```bash
    npm install
    ```

### Running in Development Mode

Start the development server with:

```bash
npm run dev
```

The application will be available at: [http://localhost:5173/diablo_web/](http://localhost:5173/diablo_web/).

### Building for Production

To create a production-ready build, run:

```bash
npm run build
```

The compiled files will be located in the `dist/` directory.

## Deploying on Your Own Server

If you need a simpler configuration for hosting the game, check out the [**diablo_web_simple**](https://github.com/JohnImril/diablo_web_simple) repository. This streamlined version makes it easier to deploy without complex setups.

## Contributing

Contributions are welcome! If you find a bug or have an idea for a new feature, feel free to open an issue or submit a pull request.

## Acknowledgements

Special thanks to [d07RiV](https://github.com/d07RiV) for the original DiabloWeb project, which laid the groundwork for this endeavor. Additional gratitude goes to the [devilution](https://github.com/diasurgical/devilution) team for their invaluable efforts in making Diablo 1 accessible on modern platforms.
