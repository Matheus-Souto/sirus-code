import { memo, useMemo } from "react";
import { SvgXml } from "react-native-svg";
import * as icons from "react-material-icon-theme";

import { materialFileIcon } from "@sirus/lib/material-file-icon";

/** File and folder icons from the Material Icon Theme, the desktop's (`FileGlyph`) and VS Code's. */
export const FileIcon = memo(function FileIcon(props: { readonly name: string; readonly directory?: boolean; readonly size?: number }) {
  const svg = useMemo(() => icons.getIconSvg(props.directory
    ? icons.getFolderIcon({ folderName: props.name, isOpen: false, isRoot: false })
    : materialFileIcon(icons, props.name)) ?? "", [props.name, props.directory]);
  return svg ? <SvgXml xml={svg} width={props.size ?? 20} height={props.size ?? 20} /> : null;
});
