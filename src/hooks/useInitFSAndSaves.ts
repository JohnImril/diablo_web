import { useState, useEffect, useRef, useCallback } from "react";

import create_fs from "../fs";
import { SpawnSizes } from "../api/load_spawn";
import getPlayerName from "../api/savefile";
import { IPlayerInfo } from "../types";

export function useInitFSAndSaves() {
	const fsRef = useRef(create_fs());
	const [hasSpawn, setHasSpawn] = useState(false);
	const [saveNames, setSaveNames] = useState<Record<string, IPlayerInfo | null> | boolean>(false);

	const updateSaves = useCallback(async () => {
		const fsInstance = await fsRef.current;
		const saves: Record<string, IPlayerInfo | null> = {};

		[...fsInstance.files.keys()]
			.filter((name) => /\.sv$/i.test(name))
			.forEach((name) => {
				const file = fsInstance.files.get(name);
				if (file) {
					saves[name] = getPlayerName(file.buffer, name);
				}
			});
		setSaveNames(saves);
	}, []);

	useEffect(() => {
		fsRef.current.then((fsInstance) => {
			const spawn = fsInstance.files.get("spawn.mpq");
			if (spawn && SpawnSizes.includes(spawn.byteLength)) {
				setHasSpawn(true);
			}

			const hasAnySaves = [...fsInstance.files.keys()].some((name) => /\.sv$/i.test(name));
			if (hasAnySaves) {
				setSaveNames(true);
			}
		});
	}, []);

	return {
		fsRef,
		hasSpawn,
		saveNames,
		updateSaves,
	};
}
