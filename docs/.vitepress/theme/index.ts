import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import GithubStar from "./GithubStar.vue";
import HeroMap from "./HeroMap.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-before": () => h(HeroMap),
      "nav-bar-content-after": () => h(GithubStar),
    });
  },
};
