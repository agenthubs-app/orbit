import type {
  AppBootstrapFailure,
  AppBootstrapInput,
  AppBootstrapResult,
} from "./contract";
import {
  appBootstrapFailureContext,
  appBootstrapFailureToAppError,
} from "./contract";

export interface AppBootstrapService {
  getAppBootstrap: (input?: AppBootstrapInput) => AppBootstrapResult;
}

export {
  appBootstrapFailureContext,
  appBootstrapFailureToAppError,
};

export type {
  AppBootstrapFailure,
  AppBootstrapInput,
  AppBootstrapResult,
};
