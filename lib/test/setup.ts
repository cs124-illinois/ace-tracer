import { GlobalRegistrator } from "@happy-dom/global-registrator"
import ace from "ace-builds"

GlobalRegistrator.register()
ace.config.set("basePath", "node_modules/ace-builds/src-noconflict")
